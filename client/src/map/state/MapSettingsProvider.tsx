import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTheme } from '@/components/theme/useTheme'
import { THEME_BASEMAP } from '@/map/config/styles'
import { RASTER_LAYERS } from '@/map/layers'
import { MapSettingsContext } from './mapSettingsContext'
import type { StationMarkerStyle } from './mapSettingsContext'

/** Seeded from the registry so a layer's default lives with its definition. */
const initialVisibility = (): Record<string, boolean> =>
  Object.fromEntries(
    RASTER_LAYERS.map((layer) => [layer.id, layer.defaultVisible ?? false]),
  )

export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const basemap = THEME_BASEMAP[theme]
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [showStations, setShowStations] = useState(true)
  const [stationMarkers, setStationMarkers] =
    useState<StationMarkerStyle>('pills')
  const [showKalayaanInset, setShowKalayaanInset] = useState(false)
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
      showBoundaries,
      setShowBoundaries,
      showStations,
      setShowStations,
      stationMarkers,
      setStationMarkers,
      showKalayaanInset,
      setShowKalayaanInset,
      visibleLayers,
      toggleLayer,
    }),
    [
      basemap,
      showBoundaries,
      showStations,
      stationMarkers,
      showKalayaanInset,
      visibleLayers,
      toggleLayer,
    ],
  )

  return (
    <MapSettingsContext.Provider value={value}>
      {children}
    </MapSettingsContext.Provider>
  )
}
