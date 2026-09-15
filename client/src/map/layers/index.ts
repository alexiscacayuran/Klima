import { LAYER_IDS } from '@/map/config/constants'

/**
 * Paint order, bottom to top.
 *
 * MapLibre draws layers in the order they are added, which for react-maplibre
 * means component mount order — spread across several <Source> components, that
 * is easy to get wrong and hard to review. This array is the single declaration
 * of intended order; `DataLayers` in MapRoot mounts sources to match it, and
 * interaction handlers walk it in reverse for hit-test priority.
 *
 * Adding a layer means adding it here too, or it will not be hit-testable.
 *
 * Mount order is not the whole story. Everything that draws data passes
 * `beforeId={LAYER_IDS.labelAnchor}` and lands under a fixed seam in the style,
 * so a raster overlay added later — in a component mounted after
 * AdminBoundaries — cannot bury the place names. The label layer passes no
 * beforeId and stays on top. Within each band, mount order still decides.
 */
export const LAYER_ORDER: string[] = [
  // --- the basemap's own, built by utils/basemapStyle → composeGround ---
  //
  // Not mounted by any component: these are in the style before the first
  // <Layer> exists, which is what lets the raster name one of them as a
  // beforeId. Listed anyway, because this array is where the map's paint order
  // is read, and an order missing its bottom three entries is not one.
  LAYER_IDS.ground,

  // The raster surface is the bottom of the data band, *below* the boundary
  // strokes, so administrative edges stay readable on top of it. It is the one
  // entry here that is not a MapLibre layer — deck.gl interleaves it into the
  // style, and it takes its place by naming the land layer below as its
  // beforeId rather than by mount order. See layers/RasterOverlay.
  LAYER_IDS.raster,

  // The country, over the surface rather than under it. This is the one place
  // the order is load-bearing rather than conventional: the land is painted at
  // a tenth, so what it sits above is what it tints. Below the raster it would
  // tint the ground instead and isolate nothing.
  LAYER_IDS.land,
  // …and the mask that makes it a landmass, by putting the sea back to bare
  // ground. Everything below this line is visible on land only.
  LAYER_IDS.sea,

  // --- ours, under the seam: beforeId={LAYER_IDS.labelAnchor} ---

  // Choropleth fills belong here too. A choropleth of the product's own
  // resolution paints on the child tier, which is the tier the API publishes
  // at; anything aggregated up to the parent paints on the parent fill.
  LAYER_IDS.boundariesParentFill,
  LAYER_IDS.boundariesParentLine,
  // The revealed tier draws over its parent's stroke on purpose: it is the
  // thing being examined, and its fills are translucent enough to leave the
  // frame around it visible.
  LAYER_IDS.boundariesChildFill,
  LAYER_IDS.boundariesChildLine,

  // --- over the seam: no beforeId, so this appends to the top of the style ---

  // The administrative label tier, above the basemap's own place labels, which
  // sit between the seam and this (utils/basemapStyle keeps them). Above,
  // because this is the tier carrying data: a city name is orientation, and the
  // name of the unit a forecast is *about* is the reading. Being later in the
  // style settles collisions in its favour too — MapLibre places symbol layers
  // from the top of the style down, so whatever is later is placed first and
  // keeps its spot, and a province name is never dropped for a town's.
  //
  // It reads a point source rather than the boundary tiles, because a polygon
  // cannot be labelled once; see utils/labelAnchors.
  //
  // The DOM marker and popup in overlays/LocationPopup are above even this:
  // they are elements over the canvas, not style layers, so they have no place
  // in this array and win by construction rather than by ordering.
  LAYER_IDS.boundariesLabel,
]

/**
 * A raster overlay the user can switch on.
 *
 * Empty for now by design — the app ships with the basemap and administrative
 * boundaries only. This type is the contract the first real overlay implements,
 * and the layer panel already renders whatever appears in RASTER_LAYERS, so
 * adding one is a matter of pushing a definition here plus the <Source> that
 * draws it.
 */
export type RasterLayerDefinition = {
  /** Stable id; also the visibility key in map settings. */
  id: string
  /** Shown in the layer panel. */
  label: string
  /** One line of help text under the label. */
  description?: string
  /** Whether it starts switched on. */
  defaultVisible?: boolean
}

export const RASTER_LAYERS: RasterLayerDefinition[] = [
  {
    id: LAYER_IDS.raster,
    label: 'Forecast surface',
    description:
      'The interpolated field behind the provincial figures, as published.',
    defaultVisible: true,
  },
]
