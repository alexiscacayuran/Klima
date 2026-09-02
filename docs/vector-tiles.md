# Vector Tiles

Admin boundaries are served as vector tiles by [Martin](https://maplibre.org/martin/),
reading straight from PostGIS. The pipeline is:

```
GeoPackage -> PostGIS (adm1_regions, adm2_provinces, adm3_municities)
           -> admin_boundaries_tile() -> Martin -> MVT / MLT -> map client
```

Three admin levels are served from **one** tile source, selected by a query parameter.

The map client lives **outside** this compose stack. Everything below is the contract it
consumes. The `client` service in this repo is the management console and does not render
maps.

---

## Endpoints

All of these are proxied by nginx under `/tiles/` ([nginx/default.conf](../nginx/default.conf)).
In development Martin is also published directly on `localhost:3001`.

| Endpoint | Returns |
|---|---|
| `GET /tiles/catalog` | Every published source: tiles, fonts, sprites |
| `GET /tiles/admin_boundaries` | TileJSON 3.0.0 for the boundary layer |
| `GET /tiles/admin_boundaries/{z}/{x}/{y}?level=N` | A tile, MVT or MLT (see below) |
| `GET /tiles/font/{fontstack}/{start}-{end}` | Glyph range, generated on demand |
| `GET /tiles/sprite/markers.json` / `.png` | Sprite index and sheet (`@2x` available) |
| `GET /tiles/sdf_sprite/markers.json` / `.png` | Same as SDF, for runtime `icon-color` |

Available fonts are **`Noto Sans Regular`** and **`Noto Sans Bold`** — these exact names go
in a style's `text-font`, not the filenames. Sprite images are `station`,
`station-active` and `pin`. Both lists come from `/tiles/catalog`, which is the source of
truth after any change to [martin/](../martin).

### MVT or MLT

Martin serves MVT by default and transcodes to [MLT](https://github.com/maplibre/maplibre-tile-spec)
when the client asks for it in the `Accept` header (`convert_to_mlt: auto` in
[martin/config.yaml](../martin/config.yaml)). MLT roughly halves the payload.

MapLibre GL JS ≥ 5.12 opts in per source with `encoding: 'mlt'`; anything that does not
ask keeps getting MVT, so QGIS and other MVT-only consumers are unaffected.

### Rate limits and caching

`/tiles/` has its own nginx zone — 100 r/s, burst 200 — because a single map pan fetches
dozens of tiles and the `api` zone's 10 r/s would throttle normal browsing. Tiles are
cached at the edge for an hour, keyed including the `Accept` header so an MLT tile is
never replayed to an MVT client. The `?level=` parameter is part of `$request_uri` and so
part of the cache key: each level caches independently. `X-Cache-Status` reports
`HIT`/`MISS`.

---

## The `admin_boundaries` source

Source id `admin_boundaries`, **`source-layer` is `boundaries`** — the layer name inside
the tile, set by `ST_AsMVT`. Zoom range 0–14; past z14 clients overzoom.

### Levels

`?level=` selects the admin level. It defaults to `2`; anything outside 1–3 falls back to 2.

| `level` | Table | Rows | Contents |
|---|---|---|---|
| `1` | `adm1_regions` | 18 | Regions |
| `2` | `adm2_provinces` | 87 | Provinces, plus 4 promoted rows — see below |
| `3` | `adm3_municities` | 1642 | Municipalities and cities |

**Level 3 returns an empty tile below z8.** 1642 municipality polygons in one low-zoom tile
is a payload no amount of generalization rescues, and nothing is legible at that scale.

### Properties

Identical at every level, so a style written once works for all three.

| Property | Type | Notes |
|---|---|---|
| `fid` | integer | MVT feature id. `psgc` as an integer — see below |
| `psgc` | string(10) | This row's own PSGC code. The join key |
| `name` | string | `adm1_en` / `adm2_en` / `adm3_en` for the level |
| `geo_level` | string | `Reg` / `Prov` / `Mun` / `City` |
| `adm_level` | smallint | 1 / 2 / 3. Matches the requested `level` |
| `parent_psgc` | string(10) | Parent's `psgc`. `NULL` at level 1 |

### Feature id and `feature-state`

`ST_AsMVT` only accepts an **integer** column as the feature id, so the id is `psgc` cast to
`integer` rather than the padded string. Every PSGC code fits in a 32-bit int, and `psgc` is
unique within a level — which is all a single tile ever holds — so the id is stable and
unique per tile without needing a composite key.

The client reconstructs it from any API response with `Number(psgc)`:

```js
map.setFeatureState(
  { source: 'boundaries', sourceLayer: 'boundaries', id: Number(row.psgc) },
  { color: scale(row.tmean), value: row.tmean }
);
```

### Joining climate data

`psgc` is byte-identical to `locations.id`, so a choropleth join is a plain equality — no
prefix arithmetic. The importer refuses to load a GeoPackage whose codes are not all present
in `locations`, so this join is total by construction.

```sql
SELECT m.psgc, m.adm3_en, f.value
FROM   adm3_municities m
JOIN   locations l ON l.id = m.psgc
JOIN   some_forecast f ON f.location_id = l.id;
```

### Switching level

Update the tile URL and clear feature state; the layer, its paint properties and its event
handlers all survive.

```js
function setAdminLevel(level) {
  map.getSource('boundaries')
     .setTiles([`${TILES}/admin_boundaries/{z}/{x}/{y}?level=${level}`]);
  map.removeFeatureState({ source: 'boundaries', sourceLayer: 'boundaries' });
  applyChoropleth(level);
}
```

**Always clear feature state on a level change.** Feature ids are only unique *within* a
level, so state set at one level would otherwise bleed into another.

### Non-obvious rows at level 2

`adm2_provinces` is a complete tiling of the country, not a list of provinces. Four rows
are promoted from other levels to close the gaps, which `geo_level` records:

| `psgc` | Name | `geo_level` | Promoted from |
|---|---|---|---|
| `1300000000` | National Capital Region (NCR) | `Reg` | ADM1 — replaces the 4 legislative districts |
| `1705321000` | Kalayaan | `Mun` | ADM3 — carved out of Palawan |
| `1130700000` | City of Davao | `City` | ADM3 — carved out of Davao del Sur |
| `0990101000` | City of Isabela | `City` | ADM3 — carved out of Basilan |

City of Isabela is the reason ADM1 and ADM2 reconcile: it is a Region IX city sitting inside
Basilan, a BARMM province. Promoting it keeps each region equal to the sum of its provinces.

`1999900000` "Special Geographic Area (SGA)" is a `Prov`-level row covering the 8 BARMM SGA
municipalities. It is not a PSA province but is required for national coverage.

Kalayaan and City of Davao therefore exist at **both** level 2 and level 3 with identical
geometry. A drill-down control should suppress itself when a level-2 unit's only child is
itself:

```js
const canDrillDown = children.length > 1
  || (children.length === 1 && children[0].psgc !== parent.psgc);
```

### Independent cities

35 ADM3 rows have a PSA-published parent (`adm2_psgc`) that differs from the province whose
polygon contains them (`adm2_geo_psgc`) — 33 cities coded at province level, plus Kalayaan
and City of Isabela, which are promoted to level 2 and so are their own geographic parent.

`parent_psgc` in the tile is always `adm2_geo_psgc`. Joining on `adm2_psgc` instead orphans
all 35.

### Zoom-dependent geometry

`admin_boundaries_tile()` reads `geom_generalized` below z9 and full-resolution `geom` from
z9 up. Without that split the whole archipelago lands in one low-zoom tile at full coastline
detail. If low zooms still feel heavy, raise `GENERALIZE_TOLERANCE` in
[db/import-boundaries.js](../server/db/import-boundaries.js) or lower the z9 switch in
[the migration](../server/migrations/20260812120000-add-admin-boundaries-tile-function.js).

---

## Importing boundaries

The source GeoPackage is staged on the NAS at `/API/Assets/admin-boundaries.gpkg`, visible
to the server container as `/app/climps/Assets/admin-boundaries.gpkg`. One file, three
layers.

```bash
docker exec -it server-dev npm run import:boundaries
# a different file
docker exec -it server-dev npm run import:boundaries -- /path/to/other.gpkg
# reload one layer and everything below it
docker exec -it server-dev npm run import:boundaries -- --layer=adm2_provinces
# load despite codes that do not resolve in locations (see PSGC coverage below)
docker exec -it server-dev npm run import:boundaries -- --allow-psgc-gaps
```

The source is copied to local disk before it is read. A GeoPackage is a SQLite file, so GDAL
reads it with a random access pattern, and the NAS mount sustains ~3 MB/s sequentially and
far less randomly — one sequential copy up front turns a forty-minute import into a
five-minute one.

All three levels load in **one transaction**, so a file that fails any check leaves the live
tile source untouched. It is deliberately **not** wired into `entrypoint.sh` — the file is a
~640 MB artifact that must not be re-read on every container start.

`--layer` reloads the named layer *and every layer below it*, because the lower levels carry
the foreign keys pointing back up. Naming `adm1_regions` therefore reloads all three.

### What the importer checks

Every check runs inside the transaction and all of them are reported together, so a
re-exported GeoPackage can be fixed in one QGIS pass rather than one round trip per defect.

| Check | Catches |
|---|---|
| **PSGC coverage** | Codes absent from `locations` — i.e. the GeoPackage lagging a PSA reorganisation. The symptom is otherwise silent: those units simply never receive climate data. `--allow-psgc-gaps` downgrades this to a warning |
| **Hierarchy** | `adm2.adm1_psgc` or `adm3.adm2_geo_psgc` not resolving |
| **Geometry** | Anything still invalid after `ST_MakeValid`; an extent outside valid lon/lat bounds, the signature of transposed axes |
| **Tiling** | Each parent's area against the sum of its children, at both levels. Fails only when children exceed their parent by more than 5%; smaller differences in either direction are reported |
| **Overlaps** | Any ADM2 pair intersecting by more than 1 km². This is what guarantees the carve-outs: a promoted unit left unioned into its parent shows up here as a whole-unit overlap |
| **National area** | ADM2 total outside ~300,000 km² ±5% — larger means overlaps, smaller means gaps |

ADM1 reconciles exactly. At ADM2 the check reports three known, benign differences rather
than failing on them: Naujan (+82 km²), Taal (+233) and Lake Lanao (+353) sit inside their
province polygon but belong to no municipality, so the province exceeds its children. That
is standard practice for inland water and is not fixable upstream.

Row counts are reported but **not** asserted: the expected 18/86/1642 stops being true the
moment PSA reorganises again, and the relational checks above are the invariants that
actually matter.

### Source data notes

- **PSGC vintage.** `locations` is seeded from PSGC 4Q 2025. A GeoPackage built against an
  older vintage will fail the coverage check — this happened with the Negros Island Region
  and with Sulu's move out of BARMM. Fix the codes in QGIS and re-export; do not remap them
  here.
- **Leading zeros.** The GeoPackage stores PSGC as an integer, so Regions I–IX lose their
  leading zero. The importer pads every PSGC column back to 10 characters on read, which is
  what makes `psgc` equal to `locations.id`.
- **Axis order.** GDAL 3 gives `SpatialReference.fromEPSG(4326)` the EPSG authority's
  lat/lon order, which transposes every coordinate. The importer skips the transform
  entirely when the layer is already EPSG:4326, and uses the proj4 spelling of WGS84 when it
  is not.
- **GDAL cursors and `await`.** A layer is read fully into memory before any query is
  awaited. GDAL's layer cursor does not survive an await between features: interleaving them
  silently truncates the read and leaves the dataset handle unusable for the next layer.
