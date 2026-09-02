import * as maplibregl from 'maplibre-gl'
import { Map, MapProvider } from '@vis.gl/react-maplibre'

import { MapControls } from './controls/MapControls'
import { MapToolbar } from './controls/MapToolbar'
import { LayerPanel } from './panels/LayerPanel'
import { AdminBoundaries } from './sources/AdminBoundaries'
import { useBasemapStyle } from './hooks/useBasemapStyle'
import { useElasticBounds } from './interactions/useElasticBounds'
import { MapSettingsProvider } from './state/MapSettingsProvider'
import { useMapSettings } from './state/useMapSettings'
import { INTERACTIVE_LAYER_IDS, MAP_ID } from './config/constants'
import {
  FIT_BOUNDS_OPTIONS,
  PHILIPPINES_BOUNDS,
  SOFT_BOUNDS,
  ZOOM_LIMITS,
} from './config/viewState'

// Required exactly once in the app. Popups, markers and controls render
// unstyled without it.
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * Data layers, in paint order — bottom first.
 *
 * Mount order here *is* draw order in MapLibre, so this must match LAYER_ORDER
 * in layers/index.ts. Weather overlays belong above AdminBoundaries' fill and
 * below its stroke; see the note in that file.
 */
function DataLayers() {
  return <AdminBoundaries />
}

/**
 * Owns the <Map>.
 *
 * Split out from MapRoot so hooks that need the map instance can run inside
 * <MapProvider> while still supplying props *to* <Map> — the gap MAP_ID
 * bridges.
 */
function MapScene() {
  const { basemap } = useMapSettings()
  const mapStyle = useBasemapStyle(basemap)
  // Runs before the early return below so the hook order stays fixed; it is a
  // no-op until the map instance exists.
  useElasticBounds(SOFT_BOUNDS)

  // <Map> is not mounted until the first style resolves. Handing it a
  // placeholder style instead would cost a full style reload a moment later,
  // and mounting with none makes MapLibre render an empty canvas.
  if (!mapStyle) return <div className="size-full bg-muted" />

  return (
    <Map
      id={MAP_ID}
      // Namespace import, not default: maplibre-gl v6 dropped its default
      // export. Omitting mapLib entirely also works but makes react-maplibre
      // lazily import() the library into a separate chunk, delaying first
      // paint of the one thing this app is for.
      mapLib={maplibregl}
      mapStyle={mapStyle}
      // Framing by bounds rather than center/zoom fits the country to the
      // actual viewport. Read once on mount only.
      initialViewState={{
        bounds: PHILIPPINES_BOUNDS,
        fitBoundsOptions: FIT_BOUNDS_OPTIONS,
      }}
      minZoom={ZOOM_LIMITS.minZoom}
      maxZoom={ZOOM_LIMITS.maxZoom}
      // No maxBounds on purpose — it is a hard clamp, and useElasticBounds
      // provides the limit instead, with a spring back on release.
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      // MapControls mounts an AttributionControl explicitly; leaving the
      // default on would render a second one.
      attributionControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <DataLayers />
      <MapControls />
    </Map>
  )
}

/**
 * The map surface and its chrome.
 *
 * Renders into whatever box its parent gives it, so sizing lives with the
 * layout rather than here.
 *
 * MapProvider is what makes the instance addressable by id from siblings, so
 * the toolbar and panels can reach it without being children of <Map>.
 * MapSettingsProvider wraps both for the same reason.
 */
export function MapRoot() {
  return (
    <MapSettingsProvider>
      <MapProvider>
        <div className="relative size-full overflow-hidden">
          <MapScene />
          <MapToolbar />
          <LayerPanel />
        </div>
      </MapProvider>
    </MapSettingsProvider>
  )
}
