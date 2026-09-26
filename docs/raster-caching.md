# Raster cache headers — work for the CIS repo

What the CIS stack has to change so browsers can cache the published rasters for
a year instead of fetching them again on every visit. Nearly all of the work is
in the CIS repo. One small follow-up lands in Klima's nginx afterwards (§5).

Companion to [raster-layers.md](raster-layers.md), which describes the objects
themselves. Measured against the CIS dev stack on 2026-09-24.

---

## 1. Where things stand

Every object under `processed/raster/**` is served with validators but no
lifetime:

```
HTTP/1.1 200 OK
Content-Type: image/webp
ETag: "1682c4d10a89a833e04e32cf0ea20075"
Last-Modified: Wed, 09 Sep 2026 09:35:46 GMT
x-amz-meta-weatherlayers-bounds: [114.222702,4.58694,126.607702,21.07194]
x-amz-meta-weatherlayers-image-unscale: [0,1500]
x-amz-version-id: f6689302-8c80-4234-a05a-bd88e673f57b
```

No `Cache-Control`, so each browser guesses. The usual heuristic is 10% of the
time since `Last-Modified`. A brand-new issuance, the one people actually look
at, is therefore revalidated on nearly every load, while an old one sits in cache
for days. Neither is a decision anyone made.

What the map fetches per issuance today:

| Object | Size | Requests per page load |
| --- | --- | --- |
| `.webp`, one per forecast month | ~64 kB | 6 months × (1 `HEAD` + 1 `GET`) |
| `.tif` beside each one | ~4.5 MB | not fetched by the map (QGIS only) |

In production, Klima's nginx `/rasters/` block
([nginx.conf.template](../client/nginx.conf.template)) adds
`Cache-Control: public, max-age=3600`. In development the browser talks to MinIO
directly and gets nothing.

## 2. The precondition: an object at a key never changes

The key already names everything that could change it:

```
processed/raster/{issuance year}/{prefix}.{YYYYMMDD issuance}.{YYYYMM month}.{webp|tif}
```

A new issuance produces new keys, so in principle nothing is ever overwritten. A
year-long `immutable` cache is only safe if that is guaranteed rather than just
usually true, **and here the failure is silent and wrong, not merely stale**:

- Klima fetches the pixels (`GET`) and the metadata that decodes them (`HEAD`:
  `bounds`, `image-unscale`) as two separate requests.
- Say an issuance is re-imported in place after a quantisation bound was raised:
  the pixels are re-quantised, and `image-unscale` changes from `[0,1500]` to
  `[0,2000]`.
- A browser still holding the old cached pixels reads them against the new
  range from a fresh `HEAD`, and every value on the map is off by a third.
  Nothing on screen suggests anything is wrong
  ([raster-layers.md §5](raster-layers.md)).

**CIS repo task — make overwrites impossible, not just unlikely:**

1. In the importer, check whether the key exists (`HEAD`/`stat_object`) before
   writing, and fail the import if it does. On a MinIO release that supports
   conditional writes, a `PUT` with `If-None-Match: *` does the same atomically.
2. If an issuance ever genuinely has to be reprocessed, that is a new
   publication and needs new keys. The key layout has no revision segment today,
   and Klima derives keys from the issuance date alone, so adding one needs a
   matching change on both sides. Raise it before it is needed.

If (1) cannot be guaranteed, do not use `immutable`. Use the fallback in §3
instead.

**Bucket versioning is on** (`x-amz-version-id` on every response). That does
not change the rule: versioning keeps the old bytes, but browsers only see the
current version, so an overwrite is still an overwrite as far as they are
concerned.

## 3. Stamp `Cache-Control` on every object at upload

```
Cache-Control: public, max-age=31536000, immutable
```

Set it **on the object**, not only in a proxy. MinIO stores it and returns it on
both `GET` and `HEAD` in every environment. Development then behaves like
production, and the header lives with the process that knows the object is
immutable.

Apply it to everything under `processed/raster/**`: the `.webp`, the `.tif`,
and any future derivative such as a thumbnail.

Find where the importer sets the `x-amz-meta-weatherlayers-*` metadata and add
the header in the same call. Whichever client the importer uses:

```python
# boto3
s3.upload_file(
    path, "seasonal-forecast", key,
    ExtraArgs={
        "ContentType": "image/webp",
        "CacheControl": "public, max-age=31536000, immutable",
        "Metadata": {  # unchanged — these become x-amz-meta-weatherlayers-*
            "weatherlayers-bounds": bounds_json,
            "weatherlayers-image-unscale": unscale_json,
            # …
        },
    },
)
```

```python
# minio-py — Cache-Control is a standard header, so it goes out as one and not
# as x-amz-meta-cache-control
client.fput_object(
    "seasonal-forecast", key, path,
    content_type="image/webp",
    metadata={
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-amz-meta-weatherlayers-bounds": bounds_json,
        # …
    },
)
```

```sh
# mc
mc cp --attr "Cache-Control=public, max-age=31536000, immutable" \
  sf.rainfall.20260826.202609.webp local/seasonal-forecast/processed/raster/2026/
```

**Fallback, if §2 cannot be guaranteed:** `Cache-Control: public, no-cache`.
The browser keeps a copy but checks the `ETag` on every use, and gets a `304`
with no body if nothing changed. It saves the bandwidth and still costs the
round trip.

## 4. Backfill what is already published

Object metadata cannot be edited in place. The only way to add the header to
existing objects is to copy each object onto itself with
`MetadataDirective=REPLACE`.

> **REPLACE drops every piece of user metadata that is not re-supplied.** A
> backfill that sets only `CacheControl` deletes
> `x-amz-meta-weatherlayers-bounds` and `-image-unscale`. After that the map
> refuses to draw the surface at all ("Raster is missing its georeferencing
> metadata"). Read the metadata back and send it again, as below.

```python
import boto3

CACHE_CONTROL = "public, max-age=31536000, immutable"
BUCKET = "seasonal-forecast"
PREFIX = "processed/raster/"

s3 = boto3.client("s3", endpoint_url="http://localhost:9000")  # + credentials

for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX):
    for item in page.get("Contents", []):
        key = item["Key"]
        head = s3.head_object(Bucket=BUCKET, Key=key)
        if head.get("CacheControl") == CACHE_CONTROL:
            continue  # already done; makes the script safe to re-run
        s3.copy_object(
            Bucket=BUCKET,
            Key=key,
            CopySource={"Bucket": BUCKET, "Key": key},
            MetadataDirective="REPLACE",
            Metadata=head["Metadata"],  # the weatherlayers-* entries, verbatim
            ContentType=head["ContentType"],
            CacheControl=CACHE_CONTROL,
        )
        print("stamped", key)
```

Notes:

- Run it once per environment, with credentials that can write. The anonymous
  dev policy is read-only.
- The bytes do not change, so this is not the kind of overwrite §2 forbids.
  Browsers holding a copy are reading the same pixels either way.
- With versioning on, each copy leaves the previous version behind as
  noncurrent. That is ~4.5 MB per `.tif`, so a lifecycle rule expiring
  noncurrent versions is worth adding if one does not exist.
- Leave `404`s alone. A month CIS publishes no image for answers `404` with no
  `Cache-Control` and no `Last-Modified`, which browsers do not cache. That is
  correct, because Klima treats a missing month as "nothing to draw" and should
  see one if it is ever published.

## 5. Then, in Klima

Once objects carry their own header, Klima's nginx `/rasters/` block must stop
adding one. Two `Cache-Control` headers with different `max-age` values are
contradictory, and caches may use either one or treat the response as stale
(RFC 9111 §4.2.1). In [nginx.conf.template](../client/nginx.conf.template),
delete these two lines from `location /rasters/` and let MinIO's header through:

```nginx
expires 1h;
add_header Cache-Control "public, max-age=3600";
```

Order matters. Ship §2–§4 first, and change nginx only after the backfill has
run in that environment. Otherwise production briefly serves rasters with no
lifetime at all.

## 6. Checking it worked

```sh
curl -sI http://localhost:9000/seasonal-forecast/processed/raster/2026/sf.rainfall.20260826.202609.webp
```

- `Cache-Control: public, max-age=31536000, immutable` is present.
- **All five `x-amz-meta-weatherlayers-*` headers are still present.** This is
  the one to look at after a backfill.

In the browser, load Klima, then reload. In DevTools → Network, the `.webp`
requests should show `(disk cache)` or `(memory cache)` in the Size column
rather than a byte count. The surface and the timeline's map previews should
paint as before. If the surface is missing, check the metadata headers first.
