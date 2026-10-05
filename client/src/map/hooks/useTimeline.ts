import { useEffect, useMemo } from 'react'
import {
  cisProductForVariable,
  timelineSpecForVariable,
} from '@/map/config/products'
import { timelineFor } from '@/map/config/timeline'
import type { TimelineStep } from '@/map/config/timeline'
import { useSelection } from '@/map/state/useSelection'
import { useProducts } from './useProducts'

export type TimelineState = {
  /** The window, in the order the scrubber prints it. Empty until it resolves. */
  steps: TimelineStep[]
  /**
   * Why the window is what it is — which is only interesting when it is empty,
   * because "still fetching", "the API is down" and "CIS publishes no dates for
   * this bulletin" are three different things to say to a user and the scrubber
   * cannot tell them apart from an empty array.
   */
  status: 'loading' | 'ready' | 'error' | 'none'
}

/**
 * The dates the selected product can be scrubbed through, and the guarantee
 * that the selected one is among them.
 *
 * This is where the two halves meet: the rail says which bulletin is selected,
 * the catalogue says where that dataset's newest issuance starts, and
 * config/timeline says how the product's window runs from there.
 *
 * It also owns the reconciliation, because nothing else can: the selected date
 * is a value in a window that this hook is the first to know the shape of, and
 * a window that changes under a held value leaves the map querying a date the
 * product does not publish. Switching from seasonal to a daily product changes
 * the very granularity of the id — `2026-10` for one, `2026-09-07` for the
 * other — so a stale value is not merely out of range, it is unparseable by the
 * endpoint it would be sent to.
 *
 * The window's anchor end is the default, which is not always its first step:
 * every window is listed earliest first, so a forecast opens on its first
 * month and an observation record on its last — the latest observation. Both
 * are the reading the product leads with, which is the same thing CIS returns
 * when a request omits `date` entirely. config/timeline names it, so nothing
 * here has to know which kind of window it holds.
 */
export function useTimeline(): TimelineState {
  const { variable, date, setDate } = useSelection()
  const products = useProducts()

  const catalogue = products.status === 'ready' ? products.catalogue : undefined
  const cisProduct = cisProductForVariable(variable)
  // The layer's own window, where it has one — the drought assessment and
  // outlook scrub different months of one dataset. A config object, so its
  // identity is stable and the memo below holds across renders.
  const spec = timelineSpecForVariable(variable)

  // Memoised because TimelineBar's playback timer takes the array as a
  // dependency: a fresh one every render would cancel and restart the current
  // step's dwell, and playback would stall short of the next tick.
  const { steps, initialStepId } = useMemo(
    () => timelineFor(cisProduct, spec, catalogue),
    [cisProduct, spec, catalogue],
  )

  useEffect(() => {
    if (initialStepId === null) {
      if (date !== null) setDate(null)
      return
    }
    if (!steps.some((step) => step.id === date)) setDate(initialStepId)
  }, [steps, initialStepId, date, setDate])

  const status: TimelineState['status'] =
    products.status === 'error'
      ? 'error'
      : products.status === 'loading'
        ? 'loading'
        : steps.length === 0
          ? 'none'
          : 'ready'

  return { steps, status }
}
