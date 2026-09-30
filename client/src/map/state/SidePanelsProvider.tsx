import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SidePanelsContext } from './sidePanelsContext'
import { useSelection } from './useSelection'

/**
 * Must sit inside SelectionProvider: the detail panel can only be open while
 * there is a subject for it.
 */
export function SidePanelsProvider({ children }: { children: ReactNode }) {
  const { pinned, station } = useSelection()
  const hasSubject = pinned !== null || station !== null
  const [productsOpen, setProductsOpen] = useState(true)
  const [overviewOpen, setOverviewOpen] = useState(true)
  const [wantsDetail, setWantsDetail] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [wasExpanded, setWasExpanded] = useState(panelExpanded)

  // The subject going away closes the detail panel, and the request goes with
  // it — so the next pin gets its popup until the user asks for more, rather
  // than inheriting a panel nobody opened for it. A subject *replaced* by
  // another never passes through none (the selection provider swaps pin and
  // station in one commit), so moving from one place straight to the next keeps
  // the panel open.
  //
  // Adjusted during render rather than in an effect, so the frame after the
  // subject goes never draws a panel that is about to close. The slot is
  // empty after it, so the width goes too.
  if (!hasSubject && wantsDetail) {
    setWantsDetail(false)
    setPanelExpanded(false)
  }

  // The rail comes back whenever the slot stops being wide — the collapse
  // button, or a wide panel closing, or the detail panel losing its subject.
  // Watched here, on the width itself, rather than written into each of those,
  // so a fourth way to narrow the slot cannot forget it. Adjusted during render
  // for the same reason as above: no frame with a narrow panel and no rail.
  if (wasExpanded !== panelExpanded) {
    setWasExpanded(panelExpanded)
    if (!panelExpanded) setProductsOpen(true)
  }

  const detailOpen = wantsDetail && hasSubject

  // Flags rather than the subject they were asked for: `showDetail` is called
  // in the same event that sets the subject, so any subject read here would be
  // the one being replaced.
  //
  // Swapping one panel for the other leaves the width alone: it belongs to
  // the slot, which stays occupied throughout.
  const showDetail = useCallback(() => {
    setWantsDetail(true)
    setOverviewOpen(false)
  }, [])

  const openOverview = useCallback(() => {
    setOverviewOpen(true)
    setWantsDetail(false)
  }, [])

  // The two panels never share the slot, so closing either one empties it.
  // The width resets with it, which is what makes narrow the size a panel
  // *opens* at rather than merely the one the app started at.
  const closeDetail = useCallback(() => {
    setWantsDetail(false)
    setPanelExpanded(false)
  }, [])

  const closeOverview = useCallback(() => {
    setOverviewOpen(false)
    setPanelExpanded(false)
  }, [])

  const openProducts = useCallback(() => setProductsOpen(true), [])
  const closeProducts = useCallback(() => setProductsOpen(false), [])

  // Reads the current width rather than flipping it in an updater, so the
  // rail closes only on the way out to wide, and no updater sets other state.
  const togglePanelExpanded = useCallback(() => {
    if (!panelExpanded) setProductsOpen(false)
    setPanelExpanded(!panelExpanded)
  }, [panelExpanded])

  const value = useMemo(
    () => ({
      productsOpen,
      openProducts,
      closeProducts,
      overviewOpen,
      openOverview,
      closeOverview,
      detailOpen,
      showDetail,
      closeDetail,
      panelExpanded,
      togglePanelExpanded,
    }),
    [
      productsOpen,
      openProducts,
      closeProducts,
      overviewOpen,
      openOverview,
      closeOverview,
      detailOpen,
      showDetail,
      closeDetail,
      panelExpanded,
      togglePanelExpanded,
    ],
  )

  return (
    <SidePanelsContext.Provider value={value}>
      {children}
    </SidePanelsContext.Provider>
  )
}
