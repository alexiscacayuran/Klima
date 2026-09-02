import { useMap } from '@vis.gl/react-maplibre'
import type { MapRef } from '@vis.gl/react-maplibre'
import { MAP_ID } from '@/map/config/constants'

/**
 * The app's map, or undefined until it has mounted.
 *
 * `useMap()` returns maps keyed by id (from <MapProvider>) plus `current`
 * (from MapContext). Checking the id first is what lets components *outside*
 * <Map> — like the toolbar — reach the instance; `current` alone would only
 * ever resolve for descendants.
 *
 * Every caller must handle the undefined first render, which is why this
 * returns it rather than asserting.
 */
export function useMapInstance(): MapRef | undefined {
  const maps = useMap()
  return maps[MAP_ID] ?? maps.current
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
