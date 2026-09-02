import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { BasemapId } from '@/map/config/styles'
import { DEFAULT_BASEMAP } from '@/map/config/styles'
import { WEATHER_LAYERS } from '@/map/layers'
import type { AdminLevel } from '@/map/types/features'
import { DEFAULT_ADMIN_LEVEL, MapSettingsContext } from './mapSettingsContext'

/** Seeded from the registry so a layer's default lives with its definition. */
const initialVisibility = (): Record<string, boolean> =>
  Object.fromEntries(
    WEATHER_LAYERS.map((layer) => [layer.id, layer.defaultVisible ?? false]),
  )

export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP)
  const [adminLevel, setAdminLevel] = useState<AdminLevel>(DEFAULT_ADMIN_LEVEL)
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [visibleLayers, setVisibleLayers] = useState(initialVisibility)

  const toggleLayer = useCallback((id: string, visible: boolean) => {
    setVisibleLayers((current) => ({ ...current, [id]: visible }))
  }, [])

  // Memoised so consumers do not re-render on every provider render. The
  // setters from useState are already stable, so this only changes when the
  // values actually do.
  const value = useMemo(
    () => ({
      basemap,
      setBasemap,
      adminLevel,
      setAdminLevel,
      showBoundaries,
      setShowBoundaries,
      visibleLayers,
      toggleLayer,
    }),
    [basemap, adminLevel, showBoundaries, visibleLayers, toggleLayer],
  )

  return (
    <MapSettingsContext.Provider value={value}>
      {children}
    </MapSettingsContext.Provider>
  )
}
