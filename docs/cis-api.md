# CIS API

The JSON half of the contract Klima consumes. [vector-tiles.md](vector-tiles.md)
covers the geometry; this covers the climate data that gets painted onto it.

Like Martin, the API belongs to the **CIS** stack, not this repo. Klima only reads
it. Everything below was verified against a running CIS dev stack — sample bodies
are real responses, trimmed.

```
CIS stack                                    Klima
─────────────────────────────────────        ─────────────────────
Martin  → /tiles/…   geometry, psgc     ┐
                                        ├──→ join on psgc → choropleth
Express → /api/v1/…  climate data       ┘
```

---

## 1. Reaching the API

### Base URL

| Where | Path |
|---|---|
| CIS dev stack, through its nginx | `http://localhost/api/v1` |
| Deployed | `<host>/v1/cis` — see the `stationMeta` note below |

Express always mounts at `/api/v1`; the deployed prefix is whatever the public
gateway rewrites to. Treat it as one variable, the way `VITE_TILES_URL` is
handled in [map/config/martin.ts](../client/src/map/config/martin.ts):

```bash
VITE_API_URL=https://cis.example.gov.ph/v1/cis
```

### The API sends no CORS headers

This is the first thing that will bite. `/tiles/` sets
`access-control-allow-origin` (Martin's own `cors:` block); `/api/` sets
**nothing** — there is no CORS middleware in the Express app at all. A `fetch`
from `http://localhost:5173` to `http://localhost/api/v1/...` is blocked by the
browser even though curl returns 200.

So unlike tiles, the API **must be same-origin in every mode**. Two edits:

```ts
// client/vite.config.ts — dev
server: {
  proxy: {
    '/api': { target: 'http://localhost', changeOrigin: true },
  },
},
```

```nginx
# client/nginx.conf.template — prod, alongside the existing /tiles/ block
location /api/ {
    proxy_pass ${API_UPSTREAM};
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then `VITE_API_URL` defaults to the relative `/api/v1` in both modes. Unlike the
tile base URL it does **not** need to be absolutized — that constraint is
MapLibre's handling of `style.sprite`, and nothing here passes through MapLibre.

### Rate limits

Two layers, and the nginx one is the tighter of the two for a map.

| Layer | Budget | Applies to |
|---|---|---|
| nginx `api` zone | 10 r/s, burst 20 | per IP |
| express, `apiuser` | 100 per 15 min | per account |
| express, `superuser` | 10 000 per 15 min | per account |

Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and
`RateLimit-Reset`. Over budget is `429` with `{ "message": … }`.

**A per-region fan-out is 18 requests** (see §3). At the `apiuser` ceiling that
is five full national refreshes per 15 minutes — enough, but not enough to fan
out on every pan. Fetch nationally once, cache, and filter client-side.

---

## 2. Authentication

A JWT, sent either way:

```
Authorization: Bearer <token>
```

or a `token` cookie. The cookie is set by the admin login flow and is not
Klima's path — use the header.

| Endpoint group | Auth |
|---|---|
| `/drought/*` | **required** — `apiuser` or `superuser` |
| `/fiveday` | **required** — `apiuser` or `superuser` |
| `/seasonal/*` | none |
| `/daily-monitoring/*` (GETs) | none |
| `/stations/*` | none |
| `/products` | none |

The gap is not intentional design Klima should rely on; assume every product
endpoint may become authenticated and put the token on all of them.

**Product scoping.** The middleware takes the last path segment of the router
mount — `drought`, `fiveday` — and requires the token's product list to contain
it. A `superuser` bypasses the check. So a token minted for `["drought"]`
gets `403 {"message":"Product access forbidden"}` on `/fiveday`.

**Token handling.** A `VITE_`-prefixed token is baked into the bundle and served
to anyone who loads the page. If the deployment fronts the API with the nginx in
[nginx.conf.template](../client/nginx.conf.template), inject it there instead and
keep it out of the client entirely:

```nginx
location /api/ {
    proxy_set_header Authorization "Bearer ${CIS_API_TOKEN}";
    proxy_pass ${API_UPSTREAM};
}
```

Failure shapes: `401 {"message":"Not authenticated"}` (no token),
`401 {"message":"Invalid or expired token"}`, `403 {"message":"Forbidden"}`.

---

## 3. Addressing places

### The join key

`psgc` is the same 10-character string everywhere — `locations.id` in the API,
the `psgc` tile property, and `Number(psgc)` as the MVT feature id. The join is a
plain equality; see [vector-tiles.md](vector-tiles.md#joining-climate-data).

**The field it arrives in is not consistent between products:**

| Endpoint | Field holding the PSGC | Type |
|---|---|---|
| `/drought`, `/drought/assessment`, `/drought/outlook` | `id` | string |
| `/seasonal`, `/seasonal/point` | `id` | string |
| `/fiveday` | `psgc` | string |
| `/daily-monitoring/*`, `/stations`, `/seasonal/station` | `id` / `stationId` — **a station id, not a PSGC** | number |

Normalize at the fetch boundary so nothing downstream has to remember which.

### The `location` parameter

Free text or a 10-digit PSGC code. Resolution order:

1. Product-specific alias (`metro manila` → NCR, `davao city` → City of Davao).
2. 10-digit code → exact match, else `404 Invalid PSGC code.`
3. Exact name match, case- and punctuation-insensitive.
4. Fuzzy match (Fuse.js, threshold 0.2), else `404 No matching location found.`

Only regions, provinces and the product's own extra units are searchable —
municipalities deliberately are not, so "Quezon" resolves to the province.

A **region** expands to every province inside it. A province resolves to itself.
Either way the response is an array.

### There is no national query

`location=Philippines` is a `404`. To paint the whole country, fan out over the
18 regions:

| PSGC | Region | | PSGC | Region |
|---|---|---|---|---|
| `0100000000` | Region I (Ilocos Region) | | `1200000000` | Region XII (SOCCSKSARGEN) |
| `0200000000` | Region II (Cagayan Valley) | | `1300000000` | National Capital Region (NCR) |
| `0300000000` | Region III (Central Luzon) | | `1400000000` | Cordillera Administrative Region (CAR) |
| `0400000000` | Region IV-A (CALABARZON) | | `1600000000` | Region XIII (Caraga) |
| `0500000000` | Region V (Bicol Region) | | `1700000000` | MIMAROPA Region |
| `0600000000` | Region VI (Western Visayas) | | `1800000000` | Negros Island Region (NIR) |
| `0700000000` | Region VII (Central Visayas) | | `1900000000` | Bangsamoro (BARMM) |
| `0800000000` | Region VIII (Eastern Visayas) | | | |
| `0900000000` | Region IX (Zamboanga Peninsula) | | | |
| `1000000000` | Region X (Northern Mindanao) | | | |
| `1100000000` | Region XI (Davao Region) | | | |

Pass the code, not the name — the names carry parentheses and roman numerals that
have to survive `encodeURIComponent` intact.

**Drought only** additionally accepts `luzon`, `visayas`, `mindanao`, which cuts
the national fan-out to three requests. No other product understands them.

### Extra units

Products publish at a few non-province units, all addressable by name or code:

| Unit | PSGC | Published by |
|---|---|---|
| National Capital Region (NCR) | `1300000000` | all |
| City of Davao | `1130700000` | five-day, drought |
| Kalayaan | `1705321000` | drought |
| City of Legazpi | `0500506000` | five-day |
| City of Zamboanga | `0931700000` | five-day |
| City of Isabela | `0990101000` | five-day |
| City of Cotabato | `1908703000` | five-day |

---

## 4. Coverage — where the choropleth will have holes

The API's units and the level-2 tile polygons are close but not identical. 87
polygons, 82 `Prov` rows, 85–86 publishing units. Design for gaps rather than
assuming totality.

| Polygon (level 2) | PSGC | Gap |
|---|---|---|
| Special Geographic Area (SGA) | `1999900000` | **No data from any product.** Always unpainted |
| Albay | `0500500000` | No five-day, ever — PAGASA issues City of Legazpi instead |
| Aklan | `0600400000` | No five-day, ever |
| City of Isabela | `0990101000` | Five-day only; no drought, no seasonal |

Three five-day units — Legazpi, Zamboanga, Cotabato — are **ADM3** rows and have
no level-2 polygon at all. A five-day choropleth at level 2 cannot show them;
either drop them or overlay the matching level-3 features.

**Five-day coverage varies per issuance.** Recent issuances covered 86, 86, 44,
32, 86, 74 units — an issuance is whatever PAGASA published that morning, and the
scraper does not backfill. Never treat a missing province as an error, and never
compute a national statistic from one issuance without checking the count.

---

## 5. Endpoints

Paths are relative to the base URL. All are `GET`; the `POST` routes are
admin-only import triggers and are not Klima's concern.

### `/products`

The catalogue, and the only place `nextUpdateAt` is published — use it to decide
when a cached layer is stale rather than polling.

```json
[{ "id": 3, "name": "drought", "origin": "CLIMPS",
   "description": "Provincial monthly drought assessment and outlook",
   "nextUpdateAt": "2026-08-19T16:00:00.000Z",
   "createdAt": "…", "updatedAt": "2026-07-21T10:06:14.494Z" }]
```

Product names are the strings the auth middleware scopes on: `drought`,
`fiveday`, `daily-monitoring`, `seasonal`.

---

### Drought — `/drought/*` · auth required

Monthly, per province. One issuance publishes seven months: the earliest is that
issuance's **assessment**, the six that follow are its **outlook**.

#### `GET /drought/assessment`

The choropleth endpoint. Provinces are pre-grouped by status, which is exactly
the shape a paint expression wants.

| Param | | |
|---|---|---|
| `location` | required | |
| `historical` | `true` | Up to the 6 most recent assessments instead of just the current one. Months with no issuance are absent — a `true` response may hold fewer than 6 |

```json
[{ "type": "assessment", "date": "2026-07", "issuedAt": "2026-07-20T00:00:00+08:00",
   "data": {
     "Not affected":  [{ "id": "0401000000", "name": "Batangas", "islandGroup": "Luzon" }],
     "Dry condition": [],
     "Dry spell":     [],
     "Drought":       [{ "id": "0403400000", "name": "Laguna", "islandGroup": "Luzon" }]
   }}]
```

All four status keys are always present, empty arrays included, so a legend can
be built from the response without a separate lookup.

#### `GET /drought/outlook`

Same envelope, `type: "outlook"`. `location` required; `date` (`YYYY-MM`)
optional — with it, **one object**; without it, an **array** of the six outlook
months. Branch on `Array.isArray`.

#### `GET /drought`

Assessment and outlook for one province as a single time series — the shape for a
detail panel, not a choropleth.

```json
[{ "id": "0401000000", "name": "Batangas", "issuedAt": "2026-07-20T00:00:00+08:00",
   "islandGroup": "Luzon",
   "data": [{ "id": "2458", "date": "2026-07", "type": "assessment", "status": "Not affected" },
            { "id": "2462", "date": "2026-11", "type": "outlook",    "status": "Dry condition" }] }]
```

`date` optional (`YYYY-MM` or `YYYY-MM-DD`) to pin one month.

#### `GET /drought/legend`

Static. The colours are the official palette — use them verbatim rather than
inventing a scale.

| Status | Colour | Meaning |
|---|---|---|
| Not affected | `#ffffff` | Normal conditions |
| Dry condition | `#ffff00` | 2 consecutive months 21–30 % below normal rainfall |
| Dry spell | `#ffaa00` | 3 consecutive months 21–30 % below normal |
| Drought | `#a80000` | 3 consecutive months > 60 % below normal |

White for "Not affected" reads as a hole against most basemaps. Either give it a
visible fill of your own or drop opacity and let the basemap through — but keep
the other three exact.

---

### Five-day forecast — `/fiveday` · auth required

Descriptive, not numeric: the payload is prose plus min/max temperature. Suited
to popups and a categorical `weather` fill, not a continuous ramp.

| Param | | |
|---|---|---|
| `location` | | Mutually exclusive with `prsd` |
| `prsd` | | `NCRPRSD`, `NLPRSD`, `SLPRSD`, `VISPRSD`, `MINPRSD` |
| `date` | optional | `YYYY-MM-DD`. Without it, the 5 most recent issuances |

One of `location` or `prsd` is required; both together is a `400`.

```json
[{ "psgc": "0401000000", "name": "Batangas",
   "issuedAt": "2026-09-02T09:00:00+08:00", "prsd": "NCRPRSD",
   "data": [{ "id": "24136", "date": "2026-09-02",
              "weather": "Partly cloudy to cloudy skies with isolated rainshowers or thunderstorms",
              "tmin": 27, "tmax": 33,
              "coastal": "Moderate to occasionally rough",
              "windSpeed": "Moderate to occasionally strong",
              "windDirection": "southwest" }] }]
```

`weather` is free text off PAGASA's bulletin, not an enum — bucket it with
substring matching (`/thunderstorm/i`, `/rains/i`) and keep a fallback.
`psgc` here, `id` everywhere else.

---

### Seasonal forecast — `/seasonal/*`

Monthly, six months ahead. Two resolutions from the same issuance.

#### `GET /seasonal` — province rainfall

| Param | | |
|---|---|---|
| `location` | required | |
| `date` | optional | `YYYY-MM` or `YYYY-MM-DD` |
| `spatialRes` | `station` | Switches to the station shape below for every seasonal station in the resolved provinces |

```json
[{ "id": "0401000000", "name": "Batangas", "issuedAt": "2026-08-26T00:00:00+08:00",
   "data": [{ "id": "3157", "date": "2026-09",
              "rainfallMax": 336.5873718, "rainfallMin": 222.7261963,
              "rainfallMean": 255.4965251, "rainfallPn": 91.81672473 }] }]
```

`rainfallPn` — percent of normal — is the choropleth field: it is already
normalized, so one diverging ramp centred on 100 works nationally. Raw
`rainfallMean` in mm does not, because a dry-season month and a wet-season month
share no scale.

#### `GET /seasonal/point`

`lat` + `lon` → the containing province, then the response above. Reverse-geocoded
through CIS's Nominatim. This is the click-to-query endpoint when the click is not
on a rendered feature; when it is, `queryRenderedFeatures` already gives you the
`psgc` and a plain `/seasonal?location=` is cheaper and cannot fail.

`400` if the coordinates are out of range, `404 No matching location found.` for
open sea, `503` if Nominatim is still importing.

#### `GET /seasonal/station`

Richer: temperature and tercile probabilities alongside rainfall.

`station` required — a numeric station id, or a name fuzzy-matched against
seasonal-enabled stations only. `date` optional.

```json
{ "id": 21, "station": "Ambulong, Tanauan, Batangas",
  "stationMeta": "/api/v1/stations/21", "issuedAt": "2026-08-26T00:00:00+08:00",
  "data": [{ "id": "7027", "date": "2026-09",
             "rainfallMean": 235.3046, "rainfallPn": 82.2504,
             "rainfallProbAn": 40.2156, "rainfallProbNn": 28.8029, "rainfallProbBn": 30.9816,
             "tmax": 32.607, "tmin": 24.134, "tmean": 28.371, "tmeanAnomaly": 0.576,
             "tmaxLow": 32.313, "tmaxHigh": 37.032, "tminLow": 20.919, "tminHigh": 27.046,
             "normalRainfall": 271, "normalTmax": 31.355, "normalTmin": 24.232 }] }
```

`rainfallProbAn`/`Nn`/`Bn` are above/near/below-normal terciles summing to ~100.

Note the shape change: `/seasonal/station` returns **one object**, while
`/seasonal?spatialRes=station` returns an **array** of them.

---

### Daily monitoring — `/daily-monitoring/*`

Station observations, not gridded. Renders as points, not a choropleth.

Data lags: `date` must be strictly before today in Manila, or `404 No daily
monitoring data available.` Omit `date` for the latest available day, which at
time of writing trailed by roughly three weeks — do not assume yesterday.

#### `GET /day` — every station in a location, for one day

`location` required, `date` optional.

```json
[{ "id": 21, "station": "Ambulong, Tanauan, Batangas",
   "stationMeta": "/api/v1/stations/21",
   "date": "2026-08-09", "issuedAt": "2026-08-10T08:00:00+08:00",
   "dailyData": { "id": "15659", "rainfall": 56.8, "tmax": null, "tmin": null },
   "monthlyStats": { "rainfallTotal": 407.1, "rainfallNormal": 305.5,
                     "rainfallPercentNormal": 133.26,
                     "tmaxAvg": null, "tmaxHighest": null, "tmaxNormal": 31.084,
                     "tmaxAnomaly": null, "tminAvg": null, "tminLowest": null,
                     "tminNormal": 24.320, "tminAnomaly": null,
                     "tmean": null, "tmeanNormal": 27.702, "tmeanAnomaly": null } }]
```

`monthlyStats` is month-to-date for the requested day's month, or `null` if the
month has no stored row. Stations report rainfall and temperature independently,
so a station with `rainfall` and null temps is normal, not broken.

#### `GET /day-station`

Same object for one station. `station` required (id or fuzzy name), `date`
optional.

#### `GET /historical` — a time series per station

| Param | | |
|---|---|---|
| `location` | required | |
| `period` | `7d` \| `15d` \| `30d` | Default `7d`; anything else silently becomes `7d` |
| `hideData` | `true` | Drops `data`, leaving station identity only — the cheap way to list a location's stations with the daily-monitoring filter already applied |

The window ends **yesterday** and every day in it is present, `null`-filled where
no observation exists. Length is fixed by `period`, so a sparkline needs no
gap-filling.

```json
[{ "id": 21, "station": "Ambulong, Tanauan, Batangas",
   "stationMeta": "/api/v1/stations/21",
   "data": [{ "date": "2026-08-26", "id": null,
              "rainfall": null, "tmax": null, "tmin": null,
              "normalRainfall": 305.5, "normalTmax": 31.084, "normalTmin": 24.320 }] }]
```

#### `GET /historical-station`

One station, `station` + `period`. **The normals keys are renamed** —
`rainfallNormal` / `tmaxNormal` / `tminNormal` here, against
`normalRainfall` / `normalTmax` / `normalTmin` in `/historical`. Same numbers.

#### `GET /ranking`

Top-N stations for one field on one day. Feeds a leaderboard panel directly.

| Param | | |
|---|---|---|
| `rankBy` | **required** | see below |
| `date` | optional | latest available if omitted |
| `order` | `asc` \| `desc` | default `desc` |
| `limit` | positive integer | default 10 |

Daily fields: `rainfall`, `tmax`, `tmin`.
Month-to-date fields: `rainfallTotal`, `rainfallNormal`, `tmaxAvg`, `tmaxHighest`,
`tmaxNormal`, `tmaxAnomaly`, `tminAvg`, `tminLowest`, `tminNormal`, `tminAnomaly`,
`tmean`, `tmeanNormal`, `tmeanAnomaly`.

```json
[{ "rank": 1, "id": 83, "station": "BSU, La Trinidad, Benguet",
   "stationMeta": "/api/v1/stations/83", "date": "2026-08-09", "rainfall": 263.2 }]
```

The value lands under a key **named after `rankBy`**, so read it as
`row[rankBy]`. Nulls always sort last regardless of `order`.

---

### Stations — `/stations/*`

#### `GET /stations`

| Param | | |
|---|---|---|
| `location` | optional | |
| `type` | `synop` (81) \| `agromet` (22) \| `arg` (4) \| `radar` (1) | |
| `product` | `dailyMonitoring` \| `seasonal` | Anything else is a `400` |

108 stations unfiltered.

```json
[{ "stationId": 21, "station": "Ambulong, Tanauan, Batangas",
   "stationMeta": "/api/v1/stations/21" }]
```

**No coordinates.** Building a station layer therefore costs 1 + N requests —
109 unfiltered, which the nginx `api` zone (10 r/s, burst 20) will throttle. Fetch
once at startup, batch in chunks of ~10, and cache the assembled GeoJSON in
`localStorage`; station metadata is effectively static.

`stationMeta` is a **relative path whose prefix is set by the CIS server's
`NODE_ENV`** — `/api/v1/...` in development, `/v1/cis/...` otherwise. It resolves
only if your deployment happens to mount the API at that same prefix. Build the
URL from `stationId` and your own base instead, and treat `stationMeta` as
decoration.

#### `GET /stations/:id`

```json
{ "id": 1, "type": "synop", "code": 429,
  "name": "NAIA, Pasay City", "longName": "NAIA, PASAY CITY",
  "locationId": "1300000000", "lat": 14.5047, "long": 121.004751,
  "latDms": "14° 30' 16.92\" N", "longDms": "121° 0' 17.104\" E",
  "address": "RM 415, IPT Bldg. NAIA Terminal , Pasay City",
  "elevation": 21.063, "yearRecord": "1949 - present",
  "prsd": "NCR", "obsTime": "HOURLY",
  "norPeriod": "1991-2020", "norRainfallRemarks": null, "norTempRemarks": null }
```

`long`, not `lng` or `longitude`. `locationId` is a PSGC and joins to the
boundary tiles like any other. `404 {"message":"Station not found."}`.

---

## 6. Response conventions

**Dates.** `date` is `YYYY-MM-DD` for daily and five-day, `YYYY-MM` for drought
and seasonal. `issuedAt` is always ISO with an explicit `+08:00` offset —
`new Date(issuedAt)` is safe; slicing it and reformatting in local time is not.

**Numeric ids arrive as strings.** Postgres `bigint` serializes as a JSON string:
`"id": "15659"`, `"id": "3157"`. Station ids are `smallint` and arrive as
numbers: `"id": 21`. Both can appear in one response
(`/daily-monitoring/day`: `id: 21`, `dailyData.id: "15659"`). Never `===` across
the two.

**Nulls are pervasive and expected.** A station without a temperature sensor, a
day with no observation, a month with no stored aggregate — all null, none an
error.

**Units.** Rainfall mm. Temperature °C. Elevation m. `rainfallPn` and
`rainfallPercentNormal` are percentages where 100 = normal. `*Anomaly` fields are
signed differences from normal in °C.

**Errors** are always `{ "message": "…" }`.

| Status | Cause |
|---|---|
| `400` | Missing or malformed parameter |
| `401` | No token / invalid / expired |
| `403` | Wrong role, inactive user, or product not granted |
| `404` | Unknown location, station, PSGC, or no data for the request |
| `429` | Rate limited |
| `503` | Nominatim unavailable (`/seasonal/point` only) |

A location that resolves but has no data is a `404`, not an empty array — a
region-level fan-out over a sparse product will legitimately produce 404s that
are not failures. Handle them as "no data", not as errors.

**Caching.** Express sends weak `ETag`s, so conditional requests work if you keep
the headers. There is no pagination and no bbox/viewport filtering; the unit of
retrieval is a location.

---

## 7. What the API does not offer

Worth knowing before designing around something that is not there.

| Not available | Consequence |
|---|---|
| **Raster / COG serving** | Seasonal forecast rasters are converted to COG and stored in MinIO, but nothing serves them — no presigned URLs, no titiler in the stack. Raster overlays are not possible today; provinces and stations are the only renderable resolutions |
| **GeoJSON** | No geometry from the API at all. Geometry is tiles-only |
| **Station coordinates in bulk** | 1 + N as described in §5 |
| **National / bbox / viewport queries** | Fan out over the 18 regions |
| **Live updates** | The SSE channel under `/progress/:channelId` is admin-scoped import progress, not data push. Poll `nextUpdateAt` from `/products` |
| **Consistent envelopes** | Some endpoints return an object, some an array, and the PSGC field is named differently per product. Normalize once, at the fetch boundary |

---

## 8. Suggested client shape

Mirroring the map's conventions — one file owns the contract, ids live in
constants:

```
client/src/api/
├── client.ts        base URL, auth header, error → typed rejection, ETag reuse
├── constants.ts     REGION_PSGC[], product names, rankBy fields
├── types.ts         one interface per response, mirroring §5
├── drought.ts       assessment / outlook / series / legend
├── fiveday.ts
├── seasonal.ts
├── dailyMonitoring.ts
├── stations.ts
└── normalize.ts     psgc extraction, string→number ids, object→array
```

Two things belong in `normalize.ts` rather than in components:

- **PSGC extraction.** `row.psgc ?? row.id` reads harmlessly but hides the
  station-vs-province ambiguity of §3. Give each product an explicit extractor.
- **The fan-out.** One `fetchAllRegions(fn)` that maps `REGION_PSGC`, tolerates
  404s as empty, and flattens — the whole country in one call, in one place,
  with one retry policy.

For the choropleth itself, `setFeatureState` keyed on `Number(psgc)` against
source layer `boundaries`, and paint driven by `feature-state` — the pattern in
[vector-tiles.md](vector-tiles.md#feature-id-and-feature-state). Clear feature
state on every admin-level change; ids are unique only within a level.
