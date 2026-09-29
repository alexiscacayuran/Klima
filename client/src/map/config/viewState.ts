import type { LngLatBoundsLike } from 'maplibre-gl'

/**
 * Extent of Philippine land territory, from Y'Ami in the Batanes down to
 * Saluag in Tawi-Tawi, and from Balabac east to Pusan Point in Davao Oriental.
 *
 * This is the framing target, not a limit: <Map initialViewState={{ bounds }}>
 * fits it to whatever the viewport actually is, so the whole archipelago is on
 * screen at any window size. Breathing room comes from FIT_BOUNDS_OPTIONS
 * padding rather than from inflating this box — padding is in pixels, so it
 * stays visually consistent instead of scaling with the projection.
 *
 * Excludes the Kalayaan Island Group (west, to ~114°E) and Philippine Rise
 * (east, to ~130°E). Widen here to frame the maritime claim as well.
 *
 * Slightly tighter than the [116, 4, 127, 21.5] bounds Martin advertises in its
 * admin_boundaries TileJSON: that box is the data's extent, this one is the
 * intended framing. They are allowed to differ.
 */
export const PHILIPPINES_BOUNDS: LngLatBoundsLike = [
  [116.93, 4.58],
  [126.6, 21.12],
]

/**
 * Kalayaan, as the boundary data draws it: Pag-asa Island, and nothing else.
 *
 * The municipality claims the whole island group, but the PSA geometry Martin
 * serves has a single polygon for it, about 1.3 × 0.6 km at 114.28°E. At the
 * national fit (~z6.4) that is under one pixel, which is why
 * overlays/KalayaanInset magnifies it. Measured off a z13 tile.
 *
 * Also what utils/nationalTile reads a deeper tile for: the national tile
 * generalises the island away at every level, so without a second tile
 * Kalayaan would have no label anchor.
 */
export const KALAYAAN_BOUNDS: [[number, number], [number, number]] = [
  [114.2779, 11.0506],
  [114.2898, 11.0563],
]

export const KALAYAAN_CENTER: [number, number] = [
  (KALAYAAN_BOUNDS[0][0] + KALAYAAN_BOUNDS[1][0]) / 2,
  (KALAYAAN_BOUNDS[0][1] + KALAYAAN_BOUNDS[1][1]) / 2,
]

/**
 * Slack round the island's measured extent, in degrees (~200m). The extent was
 * read off one tile; the tiles either side of it in zoom draw the coast a few
 * metres differently, and a pin on the shoreline must still count.
 */
const SHORE_SLACK = 0.002

/**
 * Whether a point is on Kalayaan — which, for a pin, is whether it is the
 * inset's to draw. A pin can only land on land, and the island is the only land
 * in the inset's view, so its extent is the whole test.
 */
export function onKalayaan({ lng, lat }: { lng: number; lat: number }) {
  const [[west, south], [east, north]] = KALAYAAN_BOUNDS
  return (
    lng >= west - SHORE_SLACK &&
    lng <= east + SHORE_SLACK &&
    lat >= south - SHORE_SLACK &&
    lat <= north + SHORE_SLACK
  )
}

/**
 * Elastic pan limit. Panning past this is allowed — it springs back on release
 * (see interactions/useElasticBounds).
 *
 * Deliberately roomy: it should feel like the surrounding seas are explorable,
 * with the country still the subject. This is NOT passed to <Map maxBounds>,
 * which is a hard clamp and would defeat the spring entirely.
 *
 * Note for anyone repurposing this as a world-scale bound: do NOT use ±180 for
 * longitude. A bounds spanning exactly 360° makes MapLibre's constrain step
 * build a singular view-projection matrix, and inverting it yields null — the
 * transform then throws "Cannot read properties of null (reading '0')" out of
 * the Map constructor and blanks the app. Any span strictly under 360 avoids it.
 */
export const SOFT_BOUNDS: LngLatBoundsLike = [
  [112.0, 0.5],
  [131.5, 25.0],
]

/** Fit inset, in pixels, applied when the initial bounds are framed. */
export const FIT_BOUNDS_OPTIONS = {
  padding: 48,
} as const

/**
 * With no maxBounds, MapLibre no longer derives a zoom floor of its own, so
 * minZoom is the only thing stopping the country shrinking to a speck. At 5
 * there is roughly one stop of regional context below the full-country fit
 * (which lands near z6 on a typical viewport).
 *
 * maxZoom 18 exceeds admin_boundaries' maxzoom of 14 on purpose: MapLibre
 * overzooms z14 tiles past that rather than requesting tiles Martin will not
 * serve, so boundaries stay on screen while future high-zoom layers (stations,
 * basemap detail) keep resolving natively.
 */
export const ZOOM_LIMITS = {
  minZoom: 5,
  maxZoom: 18,
} as const
