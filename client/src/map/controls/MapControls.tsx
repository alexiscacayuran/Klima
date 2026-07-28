import {
  AttributionControl,
  FullscreenControl,
  NavigationControl,
  ScaleControl,
} from '@vis.gl/react-maplibre'

/**
 * Standard control cluster.
 *
 * AttributionControl is explicit and `compact`, because <Map attributionControl>
 * defaults to adding one automatically — mounting this without disabling that
 * default yields two. MapRoot passes `attributionControl={false}`.
 *
 * Attribution text comes from the basemap style's own sources; layers we add
 * later should carry their own via <Source attribution>.
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
