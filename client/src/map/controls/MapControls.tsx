import {
  AttributionControl,
  FullscreenControl,
  NavigationControl,
  ScaleControl,
} from '@vis.gl/react-maplibre'

/**
 * MapLibre's own control cluster.
 *
 * These stay native rather than being rebuilt in shadcn: they are wired into
 * camera internals (compass bearing, pitch visualisation, fullscreen API) that
 * a React reimplementation would have to duplicate for no visual gain. The
 * shadcn surfaces are the app chrome — toolbar, panels — not these.
 *
 * AttributionControl is explicit and `compact` because <Map attributionControl>
 * defaults to adding one automatically; mounting this without disabling that
 * default yields two. MapRoot passes `attributionControl={false}`.
 *
 * Attribution text comes from the basemap style's own sources plus whatever
 * each <Source attribution> declares — admin_boundaries credits the PSA there.
 */
export function MapControls() {
  return (
    <>
      <NavigationControl position="top-right" visualizePitch />
      <FullscreenControl position="top-right" />
      <ScaleControl position="bottom-right" unit="metric" />
      <AttributionControl position="bottom-right" compact />
    </>
  )
}
