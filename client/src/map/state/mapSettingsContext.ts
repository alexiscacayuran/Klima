import { createContext } from 'react'
import type { BasemapId } from '@/map/config/styles'
import { DEFAULT_BASEMAP } from '@/map/config/styles'

/**
 * View settings shared between the map and the chrome around it.
 *
 * Context rather than prop drilling because the toolbar sits *outside* <Map> —
 * it is a sibling, not a child — so there is no prop path between them. Kept
 * deliberately small and dependency-free: when this outgrows a single context
 * (undo, URL sync, server-persisted views) it should become a real store, and
 * having one hook as the only read path means that swap touches this folder
 * alone.
 */
export type MapSettings = {
  basemap: BasemapId
  setBasemap: (id: BasemapId) => void

  showBoundaries: boolean
  setShowBoundaries: (visible: boolean) => void

  /** Visibility per RASTER_LAYERS id. Absent key means hidden. */
  visibleLayers: Readonly<Record<string, boolean>>
  toggleLayer: (id: string, visible: boolean) => void
}

/**
 * Defaults exist so a component rendered outside the provider degrades to a
 * read-only map rather than throwing. useMapSettings still warns — see there.
 */
export const MapSettingsContext = createContext<MapSettings>({
  basemap: DEFAULT_BASEMAP,
  setBasemap: () => {},
  showBoundaries: true,
  setShowBoundaries: () => {},
  visibleLayers: {},
  toggleLayer: () => {},
})
