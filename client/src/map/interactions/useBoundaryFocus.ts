import { useEffect, useRef } from 'react'
import type { Map as MapLibreMap, PointLike } from 'maplibre-gl'
import { INTERACTIVE_LAYER_IDS, LAYER_IDS } from '@/map/config/constants'
import { useMapEvent } from '@/map/hooks/useMapEvent'
import { useRawMap } from '@/map/hooks/useMapInstance'
import { useSelection } from '@/map/state/useSelection'
import { NO_HOVER } from '@/map/state/selectionContext'
import type { BoundaryHover } from '@/map/state/selectionContext'
import { toAdminLocation } from '@/map/types/features'
import type { AdminBoundaryFeature } from '@/map/types/features'

/**
 * One hit test against both boundary tiers.
 *
 * The cast is the query boundary the types file describes: tile properties come
 * off the wire untyped and are declared once, here, rather than at each read.
 *
 * Layers are filtered by `getLayer` first because a style that does not contain
 * one of them — the child tier is unmounted for a level-1 product, and neither
 * exists for the frame before the source mounts — makes MapLibre abort the
 * *whole* query with an error rather than skip the missing layer.
 *
 * Both tiers answer for the whole country, not just for the part of it drawn in
 * detail: the child fill is painted everywhere and merely *tinted* inside the
 * open parent (see sources/AdminBoundaries), so this resolves a province the
 * user cannot yet see the outline of. That is what keeps a click to one click
 * even when the reveal is frozen and the province is in some other region.
 */
function probe(map: MapLibreMap, point: PointLike): BoundaryHover {
  const layers = INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id))
  if (layers.length === 0) return NO_HOVER

  const features = map.queryRenderedFeatures(point, {
    layers,
  }) as AdminBoundaryFeature[]

  const child = features.find(
    (feature) => feature.layer.id === LAYER_IDS.boundariesChildFill,
  )
  const parent = features.find(
    (feature) => feature.layer.id === LAYER_IDS.boundariesParentFill,
  )

  /**
   * Which tier the product publishes at, asked of the style rather than of the
   * catalogue: the child layer is in the style exactly when there is a finer
   * tier to resolve to. Its absence is what makes the parent the answer for a
   * level-1 product, and its presence is what makes a region *not* an answer
   * for a province-level one.
   */
  const spatialTier = layers.includes(LAYER_IDS.boundariesChildFill)
    ? child
    : parent

  return {
    // A child is always inside its parent, so both are normally hit and the
    // parent answers directly. Falling back to the child's own `parent_psgc`
    // covers the seams: the two tiers are generalized independently below z9,
    // so a few pixels of a province can sit outside its region's polygon, and
    // losing the parent there would make the children flicker out from under
    // the pointer.
    parent: parent?.properties.psgc ?? child?.properties.parent_psgc ?? null,
    location: spatialTier ? toAdminLocation(spatialTier) : null,
  }
}

/** Identity of a hover, for skipping the ~60/s moves that change nothing. */
const hoverKey = (hover: BoundaryHover) =>
  `${hover.parent ?? ''}|${hover.location?.psgc ?? ''}`

const NO_HOVER_KEY = hoverKey(NO_HOVER)

/**
 * Pointing at the map: hover explores, click decides, and a decision stops the
 * exploring.
 *
 * With nothing selected, the pointer drives the drill-down.
 * sources/AdminBoundaries turns `hover.parent` into the child layers' filter and
 * withholds that one unit's own outline, so a region is replaced by its
 * provinces rather than covered by them, and the unit under the pointer *at the
 * product's resolution* is lit inside it. Nothing is committed and nothing is
 * fetched; it is a preview of what a click would get you.
 *
 * A click gets you it. One click, wherever the pointer is over land — the child
 * fill is hit-testable across the whole country, so the province resolves
 * whether or not its region is the one currently opened up. Clicking open water
 * clears the selection; clicking land the finer tier does not cover is neither,
 * because there is nothing to resolve to and dropping the selection over a lake
 * would punish a near miss.
 *
 * From the moment a selection exists, the pointer is ignored: this hook reports
 * no hover at all until the pin goes. A selection that the next stray mousemove
 * carves away is not a selection — the map would shift under a pointer that was
 * only crossing it on the way to a panel — and the preview has served its
 * purpose once the choice is made. Clicking elsewhere replaces the selection,
 * clicking water ends it, and the exploring resumes there.
 *
 * Nothing here is a selection *mode*: there is one location at a time and no
 * modifier keys.
 *
 * Subscribes rather than taking <Map> handler props so the whole interaction
 * sits with the layers it reads. That also keeps react-maplibre's own hover
 * tracking off: it only queries per mousemove when a pointer handler is passed
 * to <Map>, so this hook's query is the only one per event.
 */
export function useBoundaryFocus() {
  const map = useRawMap()
  const { setHover, setPinned, pinned } = useSelection()
  const lastHover = useRef(NO_HOVER_KEY)

  /** Publish a hover, skipping the moves that change nothing. */
  const report = (hover: BoundaryHover) => {
    const key = hoverKey(hover)
    if (key === lastHover.current) return
    lastHover.current = key
    setHover(hover)
  }

  // `pinned` is read straight from these closures rather than through a ref:
  // useMapEvent re-points its handler on every render, so a handler always sees
  // the pin as of the last commit.

  useMapEvent('mousemove', (event) => {
    if (!map) return
    const hover = probe(map, event.point)

    // An inline cursor on the canvas overrides MapLibre's own, which is CSS on
    // the container — so it has to be dropped while the map is moving, or a pan
    // that starts over a unit reads as "clickable" for its whole duration
    // instead of as grabbing. Written on every move rather than inside the
    // change guard below because a drag ends without one; assigning an
    // unchanged value is free.
    //
    // Set before the pin check on purpose: a click is live whether or not one is
    // held, and `location` is exactly what a click resolves to in both states.
    map.getCanvas().style.cursor =
      hover.location && !map.isMoving() ? 'pointer' : ''

    // The freeze. Nothing downstream hears the pointer again until the pin goes.
    if (pinned) return

    report(hover)
  })

  useMapEvent('click', (event) => {
    if (!map) return
    // Deliberately a fresh hit test rather than the last hover: a click can
    // arrive from a touch or a keyboard-driven pointer that produced no
    // mousemove at all — and while a pin is held there is no hover to reuse.
    const { parent, location } = probe(map, event.point)

    // Only a unit at the product's own resolution can be pinned — a province
    // for the seasonal forecast — because the pin is what a request's
    // `location=` is built from, and asking for a region would return the wrong
    // shape of answer.
    if (location) {
      setPinned(location)
      // Dropped in the same commit as the pin, so the frozen state is the empty
      // one: a hover left standing here would outrank the pin in
      // sources/AdminBoundaries and could never be corrected, the moves that
      // would clear it being the ones the freeze discards.
      report(NO_HOVER)
      return
    }

    // Leaving the country entirely is what clears a selection. Inside a parent
    // but on none of its children is not a deselection: it is the gap between
    // two provinces, or land under a product whose tier the server withholds at
    // this zoom (see LEVEL_3_MIN_ZOOM).
    if (!parent) setPinned(null)
  })

  // Leaving the canvas clears the reveal — including onto a floating panel,
  // which is a sibling of the map rather than a child of it, so the pointer
  // really has left. Which is the other half of what the pin is for: a panel
  // that has to keep showing a place reads `pinned`, not the hover.
  useMapEvent('mouseout', () => {
    if (map) map.getCanvas().style.cursor = ''
    report(NO_HOVER)
  })

  useEffect(() => {
    if (!map) return
    return () => {
      map.getCanvas().style.cursor = ''
    }
  }, [map])
}
