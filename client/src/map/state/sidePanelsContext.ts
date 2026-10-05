import { createContext } from 'react'
import type { OverviewSource } from '@/map/panels/overviewSummary'

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
  /**
   * The resolution the overview counts — its Provinces and Stations tabs.
   *
   * Here rather than in the panel because the dock's button for it counts the
   * same thing (see OverviewLauncher): closed on the stations tab, the button
   * shows the stations' split, and reopening it finds the tab where it was —
   * even after the detail panel has had the slot and the overview unmounted.
   */
  overviewSource: OverviewSource
  setOverviewSource: (source: OverviewSource) => void

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
   * The right-hand slot is at its wide size — half the viewport — rather than
   * the column width it opens at, whichever of the two panels is in it.
   *
   * One flag for the slot rather than one per panel: the overview and the
   * detail panel take turns in the same place, so moving from one to the other
   * — a station click from a wide overview, say — keeps the width the user
   * chose instead of snapping the slot back to narrow under them. It resets
   * only when the slot empties, so a panel opened into an empty slot still
   * opens narrow.
   *
   * Widening closes the product rail, and narrowing again — by collapsing the
   * panel or closing it — opens the rail: it was only put away to make room,
   * and once the room is given back there is nothing to keep it closed for.
   * While the slot is wide its button still brings it back beside the panel,
   * whose width already leaves the rail room.
   */
  panelExpanded: boolean
  togglePanelExpanded: () => void
}

export const SidePanelsContext = createContext<SidePanelsState>({
  productsOpen: false,
  openProducts: () => {},
  closeProducts: () => {},
  overviewOpen: false,
  openOverview: () => {},
  closeOverview: () => {},
  overviewSource: 'provinces',
  setOverviewSource: () => {},
  detailOpen: false,
  showDetail: () => {},
  closeDetail: () => {},
  panelExpanded: false,
  togglePanelExpanded: () => {},
})
