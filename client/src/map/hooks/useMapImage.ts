import { useCallback, useEffect, useState } from 'react'
import { useRawMap } from './useMapInstance'
import { useMapEvent } from './useMapEvent'

/**
 * Registers a sprite image under `id` so symbol layers can use it as
 * `icon-image`.
 *
 * This is one of the places react-maplibre has no declarative equivalent —
 * there is no <Image> component — so it drops to the raw maplibre-gl instance.
 *
 * Returns whether the image is registered. Gate `icon-image` on it: a symbol
 * layer referencing an unknown image logs a "Image not found" warning on every
 * frame until it appears.
 *
 * Re-registers on style changes, because swapping the style clears the sprite.
 *
 * `draw` must have a stable identity — define it at module scope, not inline in
 * the component, or the image re-registers on every render.
 */
export function useMapImage(id: string, draw: (size: number) => ImageData, size = 64): boolean {
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

