import { useEffect, useState } from 'react'
import { EMPTY_ANCHORS, fetchLabelAnchors } from '@/map/utils/labelAnchors'
import type { LabelAnchorCollection } from '@/map/utils/labelAnchors'
import type { AdminLevel } from '@/map/types/features'

/**
 * Cached across mounts and across products, because the answer cannot change
 * while the page is open.
 *
 * The anchors are derived from one tile of a dataset that moves when the PSA
 * reorganises — which is to say, not during a session. Switching between two
 * products published at the same level must not spend a request, and switching
 * back to one already seen must not blank its labels while a second copy of the
 * same tile is fetched.
 */
const cache = new Map<AdminLevel, LabelAnchorCollection>()

/**
 * Where each unit's name goes, for one administrative level.
 *
 * Returns an empty collection until the tile lands — which the label layer
 * renders as no labels rather than as wrong ones, and which is the only state
 * this needs: the anchors are not something a user asked for and not something
 * they can act on if it fails, so a failure logs and leaves the map without
 * names rather than putting an error where a place name should be. The
 * boundaries themselves are unaffected either way.
 */
export function useLabelAnchors(level: AdminLevel): LabelAnchorCollection {
  const [anchors, setAnchors] = useState<LabelAnchorCollection>(
    () => cache.get(level) ?? EMPTY_ANCHORS,
  )

  useEffect(() => {
    const cached = cache.get(level)
    if (cached) {
      setAnchors(cached)
      return
    }

    // Cleared first, so a slow fetch cannot leave the previous level's names
    // standing over the new level's boundaries.
    setAnchors(EMPTY_ANCHORS)

    const controller = new AbortController()

    fetchLabelAnchors(level, { signal: controller.signal })
      .then((collection) => {
        cache.set(level, collection)
        setAnchors(collection)
      })
      .catch((error: unknown) => {
        // An abort is the expected path when the level changes mid-flight.
        if (error instanceof Error && error.name === 'AbortError') return
        console.error(error)
      })

    return () => controller.abort()
  }, [level])

  return anchors
}
