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
 * Note the basemap contributes no symbol layers — they are stripped in
 * utils/stripLabels — so the entire label tier is ordered by this array.
 */
export const LAYER_ORDER: string[] = [
  // Weather rasters and choropleth fills belong here, *below* the boundary
  // stroke, so administrative edges stay readable on top of data.
  LAYER_IDS.boundariesFill,
  LAYER_IDS.boundariesLine,
]

/**
 * A weather overlay the user can switch on.
 *
 * Empty for now by design — the app ships with the basemap and administrative
 * boundaries only. This type is the contract the first real overlay implements,
 * and the layer panel already renders whatever appears in WEATHER_LAYERS, so
 * adding one is a matter of pushing a definition here plus the <Source> that
 * draws it.
 */
export type WeatherLayerDefinition = {
  /** Stable id; also the visibility key in map settings. */
  id: string
  /** Shown in the layer panel. */
  label: string
  /** One line of help text under the label. */
  description?: string
  /** Whether it starts switched on. */
  defaultVisible?: boolean
}

export const WEATHER_LAYERS: WeatherLayerDefinition[] = []
