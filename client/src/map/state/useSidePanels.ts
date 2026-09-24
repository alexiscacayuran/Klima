import { useContext } from 'react'
import { SidePanelsContext } from './sidePanelsContext'
import type { SidePanelsState } from './sidePanelsContext'

/**
 * Read/write access to the right-hand panels' state.
 *
 * Safe to call from either side of <Map>: the provider wraps both.
 */
export function useSidePanels(): SidePanelsState {
  return useContext(SidePanelsContext)
}
