import { useContext } from 'react'
import { MapSettingsContext } from './mapSettingsContext'
import type { MapSettings } from './mapSettingsContext'

/**
 * Read/write access to the shared view settings.
 *
 * Safe to call from either side of <Map>: the provider wraps both.
 */
export function useMapSettings(): MapSettings {
  return useContext(MapSettingsContext)
}
