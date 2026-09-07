import type { MapGeoJSONFeature } from 'maplibre-gl'

/**
 * Feature property shapes for the sources we query.
 *
 * MapLibre types `feature.properties` as a loose record because it comes off
 * the wire untyped. Declare each source's shape here and pair it with
 * `TypedFeature`, so the cast at the query boundary is written once and
 * reviewed in one place rather than repeated inline at each call site.
 */
export type TypedFeature<P> = MapGeoJSONFeature & { properties: P }

/** The three admin levels admin_boundaries can serve. */
export const ADMIN_LEVELS = [1, 2, 3] as const
export type AdminLevel = (typeof ADMIN_LEVELS)[number]

/**
 * Level 3 is served empty below this zoom, server-side.
 *
 * 1642 municipality polygons in one low-zoom tile is a payload no amount of
 * generalization rescues, and nothing is legible at that scale. Mirrored here so
 * the UI can explain the blank map rather than looking broken.
 */
export const LEVEL_3_MIN_ZOOM = 8

export const ADMIN_LEVEL_LABELS: Record<AdminLevel, string> = {
  1: 'Regions',
  2: 'Provinces',
  3: 'Cities & municipalities',
}

/**
 * The two tiers the map draws for a product.
 *
 * A product publishes at one administrative resolution — seasonal forecasts are
 * per province — and the map shows that tier *and* the one above it: the parent
 * is the always-visible frame, and the product's own tier is drawn inside
 * whichever parent is open — the one under the pointer, or the one holding the
 * selection. Drawing 87 provinces (or 1642 municipalities) at once is unreadable
 * at national zoom; drawing only the region in play is not.
 */
export type BoundaryLevels = {
  /** Drawn at every zoom. The tier the map drills down *from*. */
  parent: AdminLevel
  /**
   * The product's resolution, drawn inside the focused parent only. Null when
   * the product already publishes at level 1, which has no tier above it to
   * drill down from — the parent tier is then the product's own.
   */
  child: AdminLevel | null
}

export const boundaryLevels = (spatialLevel: AdminLevel): BoundaryLevels =>
  spatialLevel === 1
    ? { parent: 1, child: null }
    : { parent: (spatialLevel - 1) as AdminLevel, child: spatialLevel }

/**
 * Properties carried by every admin_boundaries feature.
 *
 * Identical at all three levels by design, so a layer written once works for
 * every level and switching levels needs no paint changes.
 */
export type AdminBoundaryProperties = {
  /** MVT feature id: `psgc` cast to integer. See adminFeatureId below. */
  fid: number
  /** This row's own 10-character PSGC code. The join key to `locations.id`. */
  psgc: string
  /** `adm1_en` / `adm2_en` / `adm3_en` for the level. */
  name: string
  /** `Reg` | `Prov` | `Mun` | `City` — the row's true level, which at level 2 may not equal adm_level. */
  geo_level: string
  /** 1 | 2 | 3. Matches the requested `level`. */
  adm_level: AdminLevel
  /** Parent's `psgc`; null at level 1. */
  parent_psgc: string | null
}

export type AdminBoundaryFeature = TypedFeature<AdminBoundaryProperties>

/**
 * A place, as the tiles describe it.
 *
 * The tiles are the app's only source of location identity: there is no
 * geometry in the CIS API and no national list to pick from, so every
 * `location=` parameter the app ever sends is built from a feature the user
 * pointed at. That makes this the handoff between the map and the API client —
 * `psgc` is `locations.id` verbatim (see docs/cis-api.md §3), and the rest is
 * what a panel needs to say *which* place it is showing without a second fetch.
 *
 * Camel-cased and flattened away from the raw tile properties on purpose:
 * nothing downstream of the map should have to know that the tile spells the
 * parent key `parent_psgc`, or that `adm_level` and `geo_level` are different
 * questions.
 */
export type AdminLocation = {
  /** The 10-character PSGC code. The join key, and what `location=` takes. */
  psgc: string
  name: string
  /** The tier this came from: 1 region, 2 province, 3 city/municipality. */
  level: AdminLevel
  /** `Reg` | `Prov` | `Mun` | `City` — at level 2 this may not match `level`. */
  geoLevel: string
  /** Parent's PSGC; null at level 1. */
  parentPsgc: string | null
}

export const toAdminLocation = (
  feature: AdminBoundaryFeature,
): AdminLocation => ({
  psgc: feature.properties.psgc,
  name: feature.properties.name,
  level: feature.properties.adm_level,
  geoLevel: feature.properties.geo_level,
  parentPsgc: feature.properties.parent_psgc,
})

/**
 * The parent-tier unit a place sits inside — itself, at level 1.
 *
 * Which is the map's whole drill-down rule, given a selection: this is the unit
 * drawn subdivided (see sources/AdminBoundaries). A level-1 unit has no tier
 * above it, so it is its own frame — which is also why `parentPsgc` is null
 * there and the fallback is not a guess.
 */
export const enclosingParent = (location: AdminLocation): string =>
  location.parentPsgc ?? location.psgc

/**
 * The integer feature id MapLibre knows a boundary by.
 *
 * `ST_AsMVT` only accepts an integer column as the feature id, so the tile
 * carries `psgc` cast to int rather than the zero-padded string. Every setFeatureState
 * call has to reconstruct it the same way, hence one function instead of
 * `Number(...)` scattered around.
 *
 * Ids are unique *within* a level only, which is what makes clearing feature
 * state on a level change mandatory — see sources/AdminBoundaries, which owns
 * that side effect for both tiers.
 */
export const adminFeatureId = (psgc: string): number => Number(psgc)
