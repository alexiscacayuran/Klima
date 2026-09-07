import { useContext } from 'react'
import { SelectionContext } from './selectionContext'
import type { MapSelection } from './selectionContext'

/**
 * Read/write access to what the map is showing and where.
 *
 * Safe to call from either side of <Map>: the provider wraps both.
 */
export function useSelection(): MapSelection {
  return useContext(SelectionContext)
}
