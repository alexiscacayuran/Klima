import { createContext } from 'react'

/**
 * The side panels: whether the product rail is open on the left, and on the
 * right which panel is up and how wide the detail panel is.
 *
 * A context for the reason every other piece of shared state here is one: the
 * panels are chrome, siblings of <Map>, while the two things that open the
 * detail panel — the popup's disclosure and a station pill — are children of
 * it. Neither has a prop path to a panel.
 *
 * Kept apart from SelectionContext because none of this is about *what* the map
 * shows. The subject the detail panel describes is the selection's (`pinned` or
 * `station`); this only says whether it is on screen, and how much room it has.
 *
 * The two panels share one slot and cannot both be up — opening either closes
 * the other — but either can be closed on its own, leaving the slot empty and
 * the button that opens the overview uncovered beneath it.
 *
 * The rail is in here because the two sides are not independent: widening the
 * detail panel closes it. That is a rule between panels, and this is where
 * the others are kept.
 */
export type SidePanelsState = {
  /**
   * The product rail is showing, rather than the button that stands in for
   * it. Open at startup.
   */
  productsOpen: boolean
  openProducts: () => void
  closeProducts: () => void

  /** The overview panel is showing. Open at startup. */
  overviewOpen: boolean
  openOverview: () => void
  closeOverview: () => void

  /** The detail panel is showing — which needs a selection to describe. */
  detailOpen: boolean
  /**
   * Open the detail panel on the current subject. Called in the same event
   * that sets the subject (a station click does both), so it asks rather than
   * checks: the provider opens it once there is a subject to show.
   */
  showDetail: () => void
  /**
   * Close it, leaving the slot empty — the overview does *not* come back by
   * itself. The selection stays, and the pin gets its popup back, because
   * closing a panel is not deselecting a place; clicking open water is.
   */
  closeDetail: () => void

  /**
   * The detail panel is at its wide size — half the viewport — rather than
   * the column width it opens at. Reset when it closes, so it always opens
   * narrow.
   *
   * Widening it closes the product rail, and narrowing it again does not bring
   * the rail back — the same rule as the overview: the rail was put away on
   * the way in, and reopening it would undo that on the user's behalf. Its
   * button is how it returns, and it can come back beside the wide panel,
   * whose width already leaves the rail room.
   */
  detailExpanded: boolean
  toggleDetailExpanded: () => void
}

export const SidePanelsContext = createContext<SidePanelsState>({
  productsOpen: false,
  openProducts: () => {},
  closeProducts: () => {},
  overviewOpen: false,
  openOverview: () => {},
  closeOverview: () => {},
  detailOpen: false,
  showDetail: () => {},
  closeDetail: () => {},
  detailExpanded: false,
  toggleDetailExpanded: () => {},
})
