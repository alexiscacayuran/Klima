import { useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Map, MapProvider } from '@vis.gl/react-maplibre'

import { BasemapToggle } from './controls/BasemapToggle'
import { MapControls } from './controls/MapControls'
import { useBasemapStyle } from './hooks/useBasemapStyle'
import { useElasticBounds } from './interactions/useElasticBounds'
import { DEFAULT_BASEMAP } from './config/styles'
import type { BasemapId } from './config/styles'
import {
  FIT_BOUNDS_OPTIONS,
  PHILIPPINES_BOUNDS,
  SOFT_BOUNDS,
  ZOOM_LIMITS,
} from './config/viewState'
import { MAP_ID } from './config/constants'

// Required exactly once in the app. Popups, markers and controls render
// unstyled without it.
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * Data layers, in paint order — bottom first.
 *
 * Empty for now. Sources mount here as children of <Map>, and their order must
 * match LAYER_ORDER in layers/index.ts.
 */
function DataLayers() {
  return null
}

/**
 * Owns the <Map> and the active basemap.
 *
 * Split out from MapRoot so hooks that need the map instance can run inside
 * <MapProvider> while still supplying props *to* <Map> — the gap MAP_ID
 * bridges once interaction handlers return.
 */
function MapScene() {
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP)
  const mapStyle = useBasemapStyle(basemap)
  // Runs before the early return below so the hook order stays fixed; it is a
  // no-op until the map instance exists.
  useElasticBounds(SOFT_BOUNDS)

  // <Map> is not mounted until the first style resolves. Handing it a
  // placeholder style instead would cost a full style reload a moment later,
  // and mounting with none makes MapLibre render an empty canvas.
  if (!mapStyle) return <div className="map-loading" />

  return (
    <>
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
        // above provides the limit instead, with a spring back on release.
        // MapControls mounts an AttributionControl explicitly; leaving the
        // default on would render a second one.
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <DataLayers />
        <MapControls />
      </Map>
      <BasemapToggle value={basemap} onChange={setBasemap} />
    </>
  )
}

/**
 * The map surface. Renders into whatever box its parent gives it, so the
 * sizing rules live in App.css rather than here.
 *
 * MapProvider is what makes the instance addressable by id from siblings;
 * UI panels added later can call useMapInstance() from anywhere beneath it.
 */
export function MapRoot() {
  return (
    <MapProvider>
      <div className="map-root">
        <MapScene />
      </div>
    </MapProvider>
  )
}
