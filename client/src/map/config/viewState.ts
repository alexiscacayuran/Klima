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
 */
export const PHILIPPINES_BOUNDS: LngLatBoundsLike = [
  [116.93, 4.58],
  [126.6, 21.12],
]

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
 */
export const ZOOM_LIMITS = {
  minZoom: 5,
  maxZoom: 18,
} as const
