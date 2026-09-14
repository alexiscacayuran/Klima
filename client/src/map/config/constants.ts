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
 * These intentionally do not match Martin's `admin_boundaries` — the server
 * names the dataset, the style names the binding target. Keeping them separate
 * means a server-side rename does not touch every layer and every
 * setFeatureState call.
 *
 * Two of them, because the map draws two administrative tiers at once off the
 * same Martin source: the tier the selected product publishes at, and the tier
 * above it. One source cannot serve both — the level is a query parameter on the
 * tile URL, and a source has exactly one — so the pair is two sources with one
 * URL each. Which levels they carry is the product's business, not theirs; see
 * sources/AdminBoundaries.
 */
export const SOURCE_IDS = {
  /** The tier above the product's resolution: the always-drawn overview. */
  boundariesParent: 'boundaries-parent',
  /**
   * The product's own resolution — revealed inside the focused parent, and the
   * tier climate data joins to, since it is the tier the API publishes at.
   */
  boundariesChild: 'boundaries-child',
  /**
   * Label anchors — one point per unit at the product's own resolution.
   *
   * A third source, and not a vector one, because the boundary tiles cannot
   * answer this question: MapLibre labels a polygon once per outer ring, so
   * asking them for names yields 553 labels for 86 provinces. See
   * utils/labelAnchors, which derives the points this carries.
   */
  boundaryLabels: 'boundary-labels',
} as const

export const LAYER_IDS = {
  boundariesParentFill: 'boundaries-parent-fill',
  boundariesParentLine: 'boundaries-parent-line',
  boundariesChildFill: 'boundaries-child-fill',
  boundariesChildLine: 'boundaries-child-line',
  /**
   * The names of the units the selected product publishes for. One layer, not
   * one per tier: the labels name the resolution the data is at, which is the
   * child tier when there is one and the parent tier otherwise.
   */
  boundariesLabel: 'boundaries-label',
  /**
   * Not a layer anything draws: the seam between the map's data and its labels.
   *
   * Added to the style itself rather than mounted as a component — it has to
   * exist before the first <Layer> is created, and it belongs to the basemap's
   * shape rather than to any source. See utils/basemapStyle.
   */
  labelAnchor: 'klima-label-anchor',
} as const

/**
 * Layers the map hit-tests on click and on mousemove, topmost first.
 *
 * The fill layers are listed rather than the lines because a 1px stroke is a
 * hostile click target; the fills are painted at near-zero opacity precisely so
 * they can absorb hits (see sources/AdminBoundaries).
 *
 * Order matters. A child sits *inside* its parent, so a point over one is over
 * both; listing the child first is what makes the finer unit win, which is what
 * interactions/useBoundaryFocus reads as the location. The child fill is painted
 * across the whole country for exactly this reason — it answers everywhere, not
 * only where its outlines are drawn, so a click lands on a province rather than
 * on the region containing it even when that region is not the open one.
 *
 * Also wired into <Map interactiveLayerIds> so map-level pointer handlers get
 * the same features. react-maplibre drops ids that are not in the style before
 * querying, so listing the child layer costs nothing while a product publishes
 * at level 1 and mounts no child tier.
 *
 * Do not pass an *empty* array to <Map interactiveLayerIds>: react-maplibre
 * treats any array as "tracking on" and queries with `layers: []`, which
 * hit-tests every layer in the style rather than none.
 */
export const INTERACTIVE_LAYER_IDS: string[] = [
  LAYER_IDS.boundariesChildFill,
  LAYER_IDS.boundariesParentFill,
]
