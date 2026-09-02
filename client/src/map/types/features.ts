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
 * The integer feature id MapLibre knows a boundary by.
 *
 * `ST_AsMVT` only accepts an integer column as the feature id, so the tile
 * carries `psgc` cast to int rather than the zero-padded string. Every setFeatureState
 * call has to reconstruct it the same way, hence one function instead of
 * `Number(...)` scattered around.
 *
 * Ids are unique *within* a level only, which is what makes clearing feature
 * state on a level change mandatory — see useAdminLevel in state/useMapSettings.
 */
export const adminFeatureId = (psgc: string): number => Number(psgc)
