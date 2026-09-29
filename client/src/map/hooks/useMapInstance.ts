import { useMap } from '@vis.gl/react-maplibre'
import type { MapRef } from '@vis.gl/react-maplibre'
import { MAP_ID } from '@/map/config/constants'

/**
 * The map the caller is drawn in, or undefined until it has mounted.
 *
 * `useMap()` returns maps keyed by id (from <MapProvider>) plus `current`
 * (from MapContext). The enclosing <Map> wins: there are two maps on screen —
 * the main one and the Kalayaan inset (overlays/KalayaanInset) — and the same
 * layer components are mounted in both, so a layer has to reach the map it is
 * a child of rather than the one with the well-known id. Anything *outside*
 * every <Map> — the search bar, the panels — has no `current`, and falls back
 * to the main map by id.
 *
 * Every caller must handle the undefined first render, which is why this
 * returns it rather than asserting.
 */
export function useMapInstance(): MapRef | undefined {
  const maps = useMap()
  return maps.current ?? maps[MAP_ID]
}

/**
 * The raw maplibre-gl Map, for APIs react-maplibre deliberately hides.
 *
 * MapRef omits the mutators that would desync the React binding
 * (addLayer, setPaintProperty, setStyle, …). Reach for this only when there is
 * no declarative equivalent — addImage, addProtocol, setFeatureState,
 * custom controls — and never to mutate layers that <Layer> owns.
 */
export function useRawMap() {
  return useMapInstance()?.getMap()
}
