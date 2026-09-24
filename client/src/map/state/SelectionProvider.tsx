import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_VARIABLE_KEY,
  NO_HOVER,
  SelectionContext,
} from './selectionContext'
import type { BoundaryHover, PinnedLocation } from './selectionContext'

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [variable, setVariable] = useState<string | null>(DEFAULT_VARIABLE_KEY)
  // One object rather than two states: the parent and the unit under the
  // pointer are read from a single hit test and are only ever meaningful
  // together — a parent with a stale child in it is a flicker.
  const [hover, setHover] = useState<BoundaryHover>(NO_HOVER)
  const [pinned, setPinnedState] = useState<PinnedLocation | null>(null)
  const [station, setStationState] = useState<number | null>(null)
  // No initial value: which dates exist is the product catalogue's answer, not
  // this file's. useTimeline fills it in when the catalogue lands and keeps it
  // inside the selected product's window from then on.
  const [date, setDate] = useState<string | null>(null)

  // The pin and the station are one subject slot with two kinds of occupant,
  // so choosing either evicts the other. Done here rather than at the call
  // sites so the rule holds for every writer, including ones not written yet.
  // Clearing one never touches the other: closing the popup of a pin that has
  // already been replaced by a station must not deselect the station.
  const setPinned = useCallback((location: PinnedLocation | null) => {
    setPinnedState(location)
    if (location) setStationState(null)
  }, [])
  const setStation = useCallback((stationId: number | null) => {
    setStationState(stationId)
    if (stationId !== null) setPinnedState(null)
  }, [])

  // Memoised so consumers do not re-render on every provider render. The
  // setters are stable, so this only changes when the values actually do —
  // which for `hover` is once per boundary crossed, not once per mousemove, and
  // not at all while a pin is held; see interactions/useBoundaryFocus.
  const value = useMemo(
    () => ({
      variable,
      setVariable,
      hover,
      setHover,
      pinned,
      setPinned,
      station,
      setStation,
      location: pinned ?? hover.location,
      date,
      setDate,
    }),
    [variable, hover, pinned, station, date, setPinned, setStation],
  )

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  )
}
