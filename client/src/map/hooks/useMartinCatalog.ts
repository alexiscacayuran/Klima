import { useEffect, useState } from 'react'
import { catalogUrl } from '@/map/config/martin'
import type { MartinCatalog } from '@/map/types/catalog'

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: MartinCatalog }
  | { status: 'error'; error: Error }

/**
 * Fetches Martin's catalog once on mount.
 *
 * The catalog is the source of truth for which sources, fonts and sprites the
 * server actually publishes, so this is what turns "the map is blank" into a
 * diagnosable state. The tile server is a separate stack (CIS) that can be down
 * while this app is perfectly healthy — an explicit error state is how the UI
 * says which of the two is at fault instead of rendering an empty ocean.
 *
 * Deliberately not used to *build* the style: hard-coding source ids in
 * config/martin and validating against the catalog gives a clear error, whereas
 * deriving layers from whatever the server happens to publish would fail
 * silently and differently on every environment.
 */
export function useMartinCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(catalogUrl(), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Tile catalog returned ${response.status}`)
        }
        return response.json() as Promise<MartinCatalog>
      })
      .then((catalog) => setState({ status: 'ready', catalog }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => controller.abort()
  }, [])

  return state
}
