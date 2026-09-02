import { useEffect, useRef } from 'react'
import type { MapEventType } from 'maplibre-gl'
import { useRawMap } from './useMapInstance'

/**
 * Subscribe to a map event for the lifetime of the calling component.
 *
 * The handler is kept in a ref so a new inline closure on every render does not
 * churn the subscription — the effect depends only on the event name.
 *
 * Prefer the <Map onClick={...}> props for the common events; this is for the
 * ones react-maplibre does not surface (e.g. 'styleimagemissing', 'dataloading')
 * or for subscribing from a component nested below <Map>.
 */
export function useMapEvent<T extends keyof MapEventType>(
  type: T,
  handler: (event: MapEventType[T]) => void,
): void {
  const map = useRawMap()
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!map) return
    const listener = (event: MapEventType[T]) => handlerRef.current(event)
    map.on(type, listener)
    return () => {
      map.off(type, listener)
    }
  }, [map, type])
}
