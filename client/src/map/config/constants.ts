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
  /**
   * The same anchors, carrying the selected layer's reading — only the units
   * that have one. Apart from `boundaryLabels` so a layer or month change
   * re-tiles the values and leaves the names alone: MapLibre recognises a label
   * across an update by its text, and a name whose text never changes is never
   * faded out and placed again.
   */
  boundaryLabelValues: 'boundary-label-values',
  /**
   * Station points, clustered.
   *
   * GeoJSON rather than vector: there is no geometry in the CIS API and none in
   * Martin for stations either, so the collection is assembled in the browser
   * from `/stations` and handed over whole. The source exists to do the
   * clustering — MapLibre's own, off one `cluster: true` — and is read back with
   * `querySourceFeatures` rather than drawn; see overlays/StationMarkers.
   */
  stations: 'stations',
} as const

export const LAYER_IDS = {
  /**
   * The flat, opaque colour under everything, and the only thing beneath the
   * forecast surface. See utils/basemapStyle → composeGround.
   */
  ground: 'klima-ground',
  /**
   * The continuous field under everything — the interpolated surface the
   * selected product was gridded on before it was averaged into provinces.
   *
   * Not a MapLibre layer: it is a deck.gl layer interleaved into the style by
   * layers/RasterOverlay, which is why nothing declares it as a <Layer>. The id
   * is here anyway because it takes a place in LAYER_ORDER like any other.
   */
  raster: 'raster',
  /**
   * The landmass: the basemap's own ground and every land layer behind it,
   * dimmed to a tenth and drawn over the raster.
   *
   * The id belongs to the base coat — the basemap's `background`, renamed —
   * and the rest of the tier follows it in the style. The raster names this as
   * its `beforeId`, which is what puts the forecast under the country.
   *
   * It is deliberately **not** administrative. Nothing about it is sourced from
   * Martin, so a product that draws no boundaries at all — a seasonal
   * temperature variable, for one — still has a country under it. See
   * utils/basemapStyle → composeGround.
   */
  land: 'klima-land',
  /**
   * The sea, painted opaque in the ground colour over the land tier.
   *
   * A mask, not a colour: it is what takes the land tint and the raster back
   * off the water, and so the thing that makes the layer above a landmass
   * rather than a wash over the whole viewport.
   */
  sea: 'klima-sea',
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
   * The reading under each name. Shown only where its name is placed — see
   * usePlacedValues in sources/AdminBoundaries.
   */
  boundariesLabelValue: 'boundaries-label-value',
  /**
   * Not a layer anything draws: the seam between the map's data and its labels.
   *
   * Added to the style itself rather than mounted as a component — it has to
   * exist before the first <Layer> is created, and it belongs to the basemap's
   * shape rather than to any source. See utils/basemapStyle.
   */
  labelAnchor: 'klima-label-anchor',
  /**
   * Not a layer anything draws either, and for a stranger reason than the seam
   * above: it exists so that its *source* stays loaded.
   *
   * MapLibre recomputes, every frame, which sources are in use — a source no
   * unhidden layer references has its ideal tile list emptied and loads nothing
   * (style.ts `used`, tile_manager.ts `update`). `querySourceFeatures` then
   * returns an empty array with no error, which is how a clustered source with
   * no layers fails: silently, and looking exactly like "no data".
   *
   * So the station source carries this. `filter: false` rather than
   * `visibility: 'none'` — the latter counts as hidden and would defeat the
   * whole point, while a false filter leaves the layer visible to that
   * bookkeeping and populates zero features into its bucket, so there is nothing
   * to upload and nothing to draw. It must also carry no minzoom or maxzoom,
   * which are the other half of `isHidden`.
   */
  stationPoints: 'station-points',
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
