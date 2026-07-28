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

export const SOURCE_IDS = {} as const

export const LAYER_IDS = {} as const

/**
 * Layers the map hit-tests on click/hover, topmost first.
 *
 * Wire this into <Map interactiveLayerIds> once there are layers to hit-test.
 * Do not pass it while empty: react-maplibre treats any array as "tracking on"
 * and queries with `layers: []`, which hit-tests every layer in the style
 * rather than none.
 */
export const INTERACTIVE_LAYER_IDS: string[] = []
