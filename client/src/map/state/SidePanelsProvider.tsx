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
  const [overviewOpen, setOverviewOpen] = useState(true)
  const [wantsDetail, setWantsDetail] = useState(false)
  const [detailExpanded, setDetailExpanded] = useState(false)

  // The subject going away closes the detail panel, and the request goes with
  // it — so the next pin gets its popup until the user asks for more, rather
  // than inheriting a panel nobody opened for it. A subject *replaced* by
  // another never passes through none (the selection provider swaps pin and
  // station in one commit), so moving from one place straight to the next keeps
  // the panel open.
  //
  // Adjusted during render rather than in an effect, so the frame after the
  // subject goes never draws a panel that is about to close.
  if (!hasSubject && wantsDetail) {
    setWantsDetail(false)
    setDetailExpanded(false)
  }

  const detailOpen = wantsDetail && hasSubject

  // Flags rather than the subject they were asked for: `showDetail` is called
  // in the same event that sets the subject, so any subject read here would be
  // the one being replaced.
  const showDetail = useCallback(() => {
    setWantsDetail(true)
    setOverviewOpen(false)
  }, [])

  // The width resets with every close, which is what makes narrow the size the
  // panel *opens* at rather than merely the one it started at.
  const closeDetail = useCallback(() => {
    setWantsDetail(false)
    setDetailExpanded(false)
  }, [])

  const openOverview = useCallback(() => {
    setOverviewOpen(true)
    setWantsDetail(false)
    setDetailExpanded(false)
  }, [])

  const closeOverview = useCallback(() => setOverviewOpen(false), [])

  const toggleDetailExpanded = useCallback(
    () => setDetailExpanded((expanded) => !expanded),
    [],
  )

  const value = useMemo(
    () => ({
      overviewOpen,
      openOverview,
      closeOverview,
      detailOpen,
      showDetail,
      closeDetail,
      detailExpanded,
      toggleDetailExpanded,
    }),
    [
      overviewOpen,
      openOverview,
      closeOverview,
      detailOpen,
      showDetail,
      closeDetail,
      detailExpanded,
      toggleDetailExpanded,
    ],
  )

  return (
    <SidePanelsContext.Provider value={value}>
      {children}
    </SidePanelsContext.Provider>
  )
}
