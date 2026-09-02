/**
 * Every source and layer id in the app lives here.
 *
 * Imperative calls (setFeatureState, queryRenderedFeatures, getLayer) reference
 * these from files other than the JSX that declares them, so string literals
 * would drift silently. Keep them here and import both sides.
 */

/**
 * Id of the single <Map> instance. Components outside <Map> (but inside
 * <MapProvider>) reach it as `useMap()[MAP_ID]`; `useMap().current` only
 * resolves for descendants of <Map>.
 */
export const MAP_ID = 'main'

/**
 * Client-side source ids.
 *
 * `boundaries` intentionally does not match Martin's `admin_boundaries` — the
 * server names the dataset, the style names the binding target. Keeping them
 * separate means a server-side rename does not touch every layer and every
 * setFeatureState call.
 */
export const SOURCE_IDS = {
  boundaries: 'boundaries',
} as const

export const LAYER_IDS = {
  boundariesLine: 'boundaries-line',
  boundariesFill: 'boundaries-fill',
} as const

/**
 * Layers the map hit-tests on click/hover, topmost first.
 *
 * Wired into <Map interactiveLayerIds>. The fill layer is listed rather than the
 * line because a 1px stroke is a hostile click target; the fill is painted at
 * near-zero opacity precisely so it can absorb hits (see sources/AdminBoundaries).
 *
 * Do not pass an *empty* array to <Map interactiveLayerIds>: react-maplibre
 * treats any array as "tracking on" and queries with `layers: []`, which
 * hit-tests every layer in the style rather than none.
 */
export const INTERACTIVE_LAYER_IDS: string[] = [LAYER_IDS.boundariesFill]
