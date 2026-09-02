import { useEffect, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAPS, styleAssets } from '@/map/config/styles'
import type { BasemapId } from '@/map/config/styles'
import { stripSymbolLayers, withMartinAssets } from '@/map/utils/stripLabels'

/**
 * Loads a basemap style, strips its labels, and repoints its glyph/sprite
 * endpoints at Martin.
 *
 * <Map mapStyle> accepts a URL, which would be simpler — but MapLibre would
 * then own the fetch and we would never get to edit the result. Fetching it
 * ourselves is what makes both edits possible at all.
 *
 * Returns undefined only until the first style resolves. On a basemap switch
 * the previous style is deliberately kept until the new one arrives, so <Map>
 * is never handed undefined mid-session and never unmounts — which would
 * otherwise reset the camera to `initialViewState` and throw away the user's
 * position on every theme toggle.
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
      .then((loaded) =>
        setStyle(withMartinAssets(stripSymbolLayers(loaded), styleAssets())),
      )
      .catch((error: unknown) => {
        // An abort is the expected path when the id changes mid-flight.
        if (error instanceof Error && error.name === 'AbortError') return
        console.error(error)
      })

    return () => controller.abort()
  }, [id])

  return style
}
