import { useCallback, useEffect, useState } from 'react'
import { useRawMap } from './useMapInstance'
import { useMapEvent } from './useMapEvent'

/**
 * Registers a runtime-generated sprite image under `id` so symbol layers can
 * use it as `icon-image`.
 *
 * For the *static* marker sprites (pin, station, station-active) prefer the
 * sheet Martin serves — it is already wired into the style by
 * utils/stripLabels → withMartinAssets, so those need no registration at all.
 * This is for images drawn at runtime: canvas-rendered wind barbs, pulsing
 * alert halos, anything whose pixels depend on data.
 *
 * Returns whether the image is registered. Gate `icon-image` on it: a symbol
 * layer referencing an unknown image logs "Image not found" on every frame
 * until it appears.
 *
 * `draw` must have a stable identity — define it at module scope, not inline in
 * the component, or the image re-registers on every render.
 */
export function useMapImage(
  id: string,
  draw: (size: number) => ImageData,
  size = 64,
): boolean {
  const map = useRawMap()
  const [ready, setReady] = useState(false)

  const register = useCallback(() => {
    if (!map) return
    if (map.hasImage(id)) {
      setReady(true)
      return
    }
    map.addImage(id, draw(size), { pixelRatio: 2 })
    setReady(true)
  }, [map, id, draw, size])

  useEffect(() => {
    if (!map) return
    register()
    return () => {
      // The map may already be torn down during unmount; removing a missing
      // image throws, so check first.
      if (map.hasImage?.(id)) map.removeImage(id)
      setReady(false)
    }
  }, [map, id, register])

  // A style swap wipes registered images; put it back.
  useMapEvent('styledata', register)

  return ready
}
