# Raster Layers

The third leg of the CIS contract. [vector-tiles.md](vector-tiles.md) covers the
geometry, [cis-api.md](cis-api.md) the numbers attached to each province; this
covers the **continuous field** — the interpolated surface the forecast was
gridded on before it was averaged into provinces.

Filed as `raster-layers.md` to sit beside `vector-tiles.md`, but note that these
are **not tiled**. One image covers the whole country per forecast month, ~60–105
kB of it. There is no `{z}/{x}/{y}`, no zoom range, and nothing to cache per tile.

Like Martin and the API, the storage belongs to the **CIS** stack. Klima only
reads it. Everything below was verified against a running CIS dev stack on
2026-09-14 — every status code, header and object key is a real response.

```
CIS stack                                         Klima
──────────────────────────────────────────        ─────────────────────
Martin  → /tiles/…      geometry, psgc       ┐
Express → /api/v1/…     province numbers     ├──→ choropleth + raster overlay
MinIO   → /seasonal-forecast/…  the surface  ┘
```

---

## 1. What is published

Every seasonal issuance writes one image per variant per forecast month:

```
processed/raster/{year}/{prefix}.{YYYYMMDD}.{YYYYMM}.webp
                                              └ forecast month
                                  └ issuance date
                        └ ISSUANCE year — see below
```

| `{prefix}`      | Unit        | Matches the API field |
| --------------- | ----------- | --------------------- |
| `sf.rainfall`   | mm          | `rainfallMean`        |
| `sf.rainfallpn` | % of normal | `rainfallPn`          |

`sf.rainfallpn` is the one to render by default, for the same reason
[cis-api.md §5](cis-api.md) gives for the choropleth: percent-of-normal is
already normalized, so one diverging ramp centred on 100 works nationally, while
raw millimetres do not compare a dry-season month against a wet one.

The full published set for the August 2026 issuance — six months ahead, both
variants:

```
processed/raster/2026/sf.rainfall.20260826.202609.webp   … .202702.webp
processed/raster/2026/sf.rainfallpn.20260826.202609.webp … .202702.webp
```

**`{year}` is the year of the issuance, not of the forecast month.** The January
and February 2027 images live under `2026/`, because
`buildProcessedRasterObjectKey()` in the importer takes its year from the parsed
issuance date. Deriving the folder from the month you are rendering gives a 404
every December.

Each `.webp` has a `.tif` beside it under the same key — a Cloud-Optimized
GeoTIFF holding the original Float32 values, ~4.4 MB against the WebP's ~80 kB.
The map wants the WebP; the COG is there for QGIS and anything needing real
values rather than the quantised ones.

---

## 2. Reaching them

| Where                                 | Base                                      |
| ------------------------------------- | ----------------------------------------- |
| CIS dev stack, MinIO's published port | `http://localhost:9000/seasonal-forecast` |
| Deployed                              | **no answer yet** — see below             |

### Rasters behave like tiles, not like the API

This is the useful thing to know up front. The API forced a proxy in every mode
because Express sets no CORS headers at all ([cis-api.md §1](cis-api.md)). MinIO
is the opposite — it echoes the request Origin, and exposes the `x-amz-*`
response headers §5 depends on:

```
access-control-allow-origin: http://localhost:5173
access-control-expose-headers: …, X-Amz*, *
```

So in development the browser hits MinIO directly, no proxy, exactly like
`VITE_TILES_URL` pointing at `localhost:3001`. Mirror
[map/config/martin.ts](../client/src/map/config/martin.ts):

```ts
const CONFIGURED_RASTER_URL =
  import.meta.env.VITE_RASTER_URL ??
  (import.meta.env.DEV
    ? "http://localhost:9000/seasonal-forecast"
    : "/rasters");
```

with `VITE_RASTER_URL=http://localhost:9000/seasonal-forecast` in
`.env.development` beside `VITE_TILES_URL` — browser-resolved, so a published host
port rather than a container hostname, for the reason that file already explains.

### Production is unsolved, deliberately

The dev access above comes from a `minio-anonymous` service in the CIS repo's
`compose.dev.yaml`, which opens the prefix to unauthenticated GET on every `up`.
It is **development only** and has no production counterpart yet. The closest
analogue is the `/tiles/` block already in
[nginx.conf.template](../client/nginx.conf.template) — an nginx `location
/rasters/` proxying MinIO, which makes the origin same-origin and lets the
prod default above stay relative. That block does not exist. Do not ship a build
whose raster URL points at a MinIO port.

---

## 3. What is actually readable

The CIS dev policy opens exactly one prefix. Verified:

| Request                                          |                    |
| ------------------------------------------------ | ------------------ |
| `processed/raster/**` — `.webp` and `.tif` alike | **200**            |
| `HEAD` on any of them                            | **200**            |
| `processed/csv/**`, `raw/**`                     | 403                |
| `?list-type=2&prefix=processed/raster/`          | **200**, recursive |
| The same listing at `processed/raster/2026/`     | **403**            |

That last row is not a typo. `mc` conditions `s3:ListBucket` on `StringEquals`,
so the single listable prefix value is the exact one that was opened — descend
one folder and it is denied.

**Do not build on listing anyway.** It is a dev-only affordance that an nginx
proxy in production will not reproduce, and it is unnecessary: §4 derives every
key from a response the app already has.

---

## 4. Choosing which raster to load

The raster key is fully determined by the `/seasonal` response the app already
fetches for the pinned province — no extra lookup, no catalogue. `issuedAt`
supplies `{YYYYMMDD}` and `{year}`; each `data[].date` supplies `{YYYYMM}`.

```json
{
  "issuedAt": "2026-08-26T00:00:00+08:00",
  "data": [{ "date": "2026-09", "rainfallPn": 91.81672473 }]
}
```

```ts
export function rasterUrl(
  issuedAt: string, // "2026-08-26T00:00:00+08:00"
  month: string, // "2026-09"
  prefix: "sf.rainfall" | "sf.rainfallpn" = "sf.rainfallpn",
  ext: "webp" | "tif" = "webp",
) {
  // Slice, never `new Date(...).getFullYear()`: issuedAt is +08:00 and a local
  // Date in any western timezone lands on the previous day — and on 31 December,
  // the previous *year*, which is the folder name.
  const [year, m, d] = issuedAt.slice(0, 10).split("-");
  return `${RASTER_URL}/processed/raster/${year}/${prefix}.${year}${m}${d}.${month.replace("-", "")}.${ext}`;
}
```

This is the raster counterpart to the `psgc` join in
[vector-tiles.md](vector-tiles.md): the same issuance that fills the choropleth
names the surface underneath it, so the two can never drift apart on screen.

A month with no published raster is a 404, not an error state worth surfacing —
the same posture [cis-api.md §6](cis-api.md) takes toward provinces with no data.
Rasters only exist from the 2026-08-26 issuance onward; earlier issuances have
COGs but no WebP.

---

## 5. Bounds and `imageUnscale` come from the object

A WebP carries no georeferencing and no record of the range its R channel was
quantised against, so both travel as object metadata. Read them with a `HEAD`:

```ts
const res = await fetch(url, { method: "HEAD" });
const bounds = JSON.parse(res.headers.get("x-amz-meta-weatherlayers-bounds")!);
const unscale = JSON.parse(
  res.headers.get("x-amz-meta-weatherlayers-image-unscale")!,
);
```

| Header                                       | Value today                                |
| -------------------------------------------- | ------------------------------------------ |
| `x-amz-meta-weatherlayers-image-type`        | `SCALAR`                                   |
| `x-amz-meta-weatherlayers-image-unscale`     | `[0,1500]` mm · `[0,250]` %                |
| `x-amz-meta-weatherlayers-bounds`            | `[114.222702,4.58694,126.607702,21.07194]` |
| `x-amz-meta-weatherlayers-width` / `-height` | `2477` / `3297`                            |

`bounds` is `[west, south, east, north]`.

Copying those literals into the bundle works right up until CIS raises a bound —
which it will, on evidence of clipped pixels, and which **re-quantises every image
published afterwards** while older ones keep the old range. A hardcoded
`imageUnscale` then misreports rainfall by hundreds of millimetres with nothing
on screen to suggest anything is wrong. One `HEAD` per image, cached alongside
the texture, is the cheap insurance.

---

## 6. Loading it

### The install is not small

`weatherlayers-gl` (2026.5.2) is a deck.gl layer pack. Its peer dependencies:

```
@deck.gl/core  @deck.gl/extensions  @deck.gl/layers  ^9.3.2
@luma.gl/core  @luma.gl/engine      ^9.3.3
geotiff        ^3.0.0
```

Klima today has `maplibre-gl` and `@vis.gl/react-maplibre` and **none** of the
above, so this is a real addition: deck.gl plus luma.gl, and `@deck.gl/mapbox`
for the `MapboxOverlay` that puts a deck layer into the existing MapLibre map.

If all you want is the decode, `weatherlayers-gl/client` is a separate entry
point exporting `loadTextureData` and `loadJson` with no deck.gl peer at all —
enough to get `{data, width, height}` and render it yourself.

### The layer

```ts
import { loadTextureData } from "weatherlayers-gl/client";
import { RasterLayer, ImageType } from "weatherlayers-gl";

const image = await loadTextureData(url);

new RasterLayer({
  id: "sf-rainfallpn",
  image,
  imageType: ImageType.SCALAR,
  imageUnscale: unscale, // §5 — from the object, not a literal
  bounds, // §5
  // Percent of normal: diverging, centred on 100.
  palette: [
    [40, [165, 42, 42]],
    [70, [222, 184, 135]],
    [100, [245, 245, 245]],
    [130, [127, 205, 187]],
    [160, [34, 94, 168]],
  ],
});
```

---

## 7. Five things that will bite

**The decoder is chosen by substring.** `loadTextureData` picks its image path
with `url.includes('.webp') || url.includes('.png') || …` and otherwise falls
through to the GeoTIFF decoder. A presigned URL keeps `.webp` in the path and is
fine; a REST wrapper like `/api/v1/raster/123` is not. **Whatever fronts these in
production must keep the extension in the path.**

**The texture cache is keyed on the URL string.** `loadTextureData` memoises on
`url + JSON.stringify(headers)`. Two consequences: a stable URL is free to
re-request across a timeline scrub, and any URL that varies per request — a
signature, a cache-buster — is a guaranteed miss and a fresh decode every time.
Pass `{ cache: false }` deliberately rather than defeating it by accident.

**Response headers are invisible to the loader.** The default path does
`img.crossOrigin = 'anonymous'; img.src = url` — an `<img>` load, not a `fetch` —
so nothing in `loadTextureData`'s result exposes the §5 metadata. That is why §5
is a separate `HEAD`. (Pass `headers` or `signal` and it switches to `fetch` +
blob URL, but still returns only `{data, width, height}`.)

**Presigned URLs do not fit.** They work as URLs, but a `GET`-presigned URL
answers **403 to `HEAD`** — SigV4 signs the method — so §5 would need a second
signature per image, and per-mint URLs miss the cache above every time. The
anonymous prefix is the dev answer; a proxy is the prod one.

**The values are quantised.** R is 256 levels across the variant's fixed range:
**5.88 mm** steps for `sf.rainfall`, **0.98 %** for `sf.rainfallpn`. Fine for a
painted surface, wrong for a readout. Any number shown to a user should come from
the API, which carries full precision — and the two will disagree slightly, which
is expected, not a bug.

---

## 8. Suggested client shape

Mirroring the existing map modules:

```
client/src/map/
├── config/rasters.ts          base URL (§2), rasterUrl() (§4), variant prefixes
├── hooks/useRasterImage.ts    HEAD + loadTextureData, keyed on the URL
└── layers/SeasonalRaster.tsx  MapboxOverlay + RasterLayer
```

`useRasterImage` should key on the URL string and nothing else — it is already
the cache key inside `loadTextureData`, so any other dependency just adds a way
for the two caches to disagree. It pairs naturally with the existing
[useSeasonalForecast](../client/src/map/hooks/useSeasonalForecast.ts), which
already holds the whole issuance so that scrubbing the timeline costs no
requests: the same response names all six rasters, and prefetching the next
month's image while the current one renders is the analogue of that decision.
