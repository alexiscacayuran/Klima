import { useMemo, useState } from 'react'
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
  const [pinned, setPinned] = useState<PinnedLocation | null>(null)
  // No initial value: which dates exist is the product catalogue's answer, not
  // this file's. useTimeline fills it in when the catalogue lands and keeps it
  // inside the selected product's window from then on.
  const [date, setDate] = useState<string | null>(null)

  // Memoised so consumers do not re-render on every provider render. The
  // setters from useState are already stable, so this only changes when the
  // values actually do — which for `hover` is once per boundary crossed, not
  // once per mousemove, and not at all while a pin is held; see
  // interactions/useBoundaryFocus.
  const value = useMemo(
    () => ({
      variable,
      setVariable,
      hover,
      setHover,
      pinned,
      setPinned,
      location: pinned ?? hover.location,
      date,
      setDate,
    }),
    [variable, hover, pinned, date],
  )

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  )
}
