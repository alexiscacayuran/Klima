import { hasOverlay, publishesStationsOnly } from '@/map/config/products'
import { useMapSettings } from './useMapSettings'
import { useSelection } from './useSelection'

export type StationVisibility = {
  /** The selected layer draws stations at all. */
  available: boolean
  /**
   * The selected layer draws *only* stations, so they are on and cannot be
   * switched off — there would be nothing left on the map.
   */
  locked: boolean
  /** Whether the station pills are on screen. */
  visible: boolean
  setVisible: (visible: boolean) => void
}

/**
 * Whether the selected layer's stations are shown, and whether the user may
 * change that.
 *
 * The one place the user's preference meets what the layer declares, so the
 * switch that writes it and the map that obeys it cannot disagree. The lock is
 * derived rather than stored: the preference is left as the user set it, and
 * comes back into force on the next layer that makes stations optional.
 */
export function useStationVisibility(): StationVisibility {
  const { variable } = useSelection()
  const { showStations, setShowStations } = useMapSettings()

  const available = hasOverlay(variable, 'stations')
  const locked = publishesStationsOnly(variable)

  return {
    available,
    locked,
    visible: available && (locked || showStations),
    setVisible: setShowStations,
  }
}
