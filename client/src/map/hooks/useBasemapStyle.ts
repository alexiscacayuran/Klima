import { useEffect, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAPS } from '@/map/config/styles'
import type { BasemapId } from '@/map/config/styles'
import { stripSymbolLayers } from '@/map/utils/stripLabels'

/**
 * Loads a basemap style and strips its label layers.
 *
 * <Map mapStyle> accepts a URL, which would be simpler — but MapLibre would
 * then own the fetch and we would never get to edit the result. Fetching it
 * ourselves is what makes the label strip possible at all.
 *
 * Returns undefined only until the first style resolves. On a basemap switch
 * the previous style is deliberately kept until the new one arrives, so <Map>
 * is never handed undefined mid-session and never unmounts — which would
 * otherwise reset the camera to `initialViewState`.
 */
export function useBasemapStyle(id: BasemapId): StyleSpecification | undefined {
  const [style, setStyle] = useState<StyleSpecification>()

  useEffect(() => {
    const controller = new AbortController()

    fetch(BASEMAPS[id], { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Basemap "${id}" failed: ${response.status}`)
        }
        return response.json() as Promise<StyleSpecification>
      })
      .then((loaded) => setStyle(stripSymbolLayers(loaded)))
      .catch((error: unknown) => {
        // An abort is the expected path when the id changes mid-flight.
        if (error instanceof Error && error.name === 'AbortError') return
        console.error(error)
      })

    return () => controller.abort()
  }, [id])

  return style
}
