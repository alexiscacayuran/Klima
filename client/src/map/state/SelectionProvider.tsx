import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { hasOverlay, spatialLevelForVariable } from '@/map/config/products'
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
  const [suspendedPin, setSuspendedPin] = useState<PinnedLocation | null>(null)
  const [station, setStationState] = useState<number | null>(null)
  // No initial value: which dates exist is the product catalogue's answer, not
  // this file's. useTimeline fills it in when the catalogue lands and keeps it
  // inside the selected product's window from then on.
  const [date, setDate] = useState<string | null>(null)

  // A pin cannot stand on a layer that draws no boundaries — there is no
  // polygon to light and no province reading to quote — so it is put aside on
  // the way to one and given back on the way out, rather than dropped. Given
  // back only to a layer at the pin's own resolution: a province is not a
  // place a municipality-level product publishes, and a fetch would key on it.
  //
  // Here rather than in the boundary layer's hooks because it is a rule about
  // the selection that has to hold in the same commit as the layer change: an
  // effect would leave a frame with a province forecast quoted under a
  // stations-only legend, and a frame on the way back with the panel shut.
  // Adjusted during render on the flag, not on `variable`, so moving between
  // two layers that both draw boundaries — or both do not — passes straight
  // through.
  const drawsBoundaries = hasOverlay(variable, 'boundaries')
  const [drew, setDrew] = useState(drawsBoundaries)
  if (drew !== drawsBoundaries) {
    setDrew(drawsBoundaries)
    if (!drawsBoundaries) {
      if (pinned) {
        setSuspendedPin(pinned)
        setPinnedState(null)
      }
    } else if (suspendedPin) {
      setSuspendedPin(null)
      if (suspendedPin.level === spatialLevelForVariable(variable)) {
        setPinnedState(suspendedPin)
      }
    }
  }

  // The pin and the station are one subject slot with two kinds of occupant,
  // so choosing either evicts the other. Done here rather than at the call
  // sites so the rule holds for every writer, including ones not written yet.
  // Clearing one never touches the other: closing the popup of a pin that has
  // already been replaced by a station must not deselect the station.
  //
  // A pin put aside is that slot's occupant too, only off the map: choosing
  // anything forgets it, as it would have evicted the pin had it been on it.
  const setPinned = useCallback((location: PinnedLocation | null) => {
    setPinnedState(location)
    if (location) {
      setStationState(null)
      setSuspendedPin(null)
    }
  }, [])
  const setStation = useCallback((stationId: number | null) => {
    setStationState(stationId)
    if (stationId !== null) {
      setPinnedState(null)
      setSuspendedPin(null)
    }
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
      suspendedPin,
      station,
      setStation,
      location: pinned ?? hover.location,
      date,
      setDate,
    }),
    [variable, hover, pinned, suspendedPin, station, date, setPinned, setStation],
  )

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  )
}
