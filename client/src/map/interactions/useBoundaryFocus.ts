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

/**
 * Whether a pointer event landed on a DOM marker rather than on the canvas.
 *
 * Station pills are DOM inside the canvas container, so their native click
 * bubbles through the map's own handler before React's root listener ever sees
 * it. A click on a marker is the marker's: without this, clicking a station
 * would also pin whatever province it stands in, and clicking a cluster would
 * pin one on its way to zooming.
 */
const onMarker = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest('.maplibregl-marker') !== null

/** Identity of a hover, for skipping the ~60/s moves that change nothing. */
const hoverKey = (hover: BoundaryHover) =>
  `${hover.parent ?? ''}|${hover.location?.psgc ?? ''}`

/**
 * How long a reading has to hold still before the map acts on it.
 *
 * The archipelago is the reason. Sweeping a pointer across the Visayas crosses a
 * dozen islands and the water between them in well under a second, and each
 * crossing is a different parent to carve open — so the reveal opens and
 * collapses a dozen times over a gesture that was only ever passing through.
 * Settling costs a beat on the hovers the user meant and removes the ones they
 * did not.
 *
 * Short enough to read as the map keeping up rather than as a delay: a hover
 * held on purpose is held for far longer than this.
 */
const HOVER_SETTLE_MS = 90

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
 * It follows the pointer where the pointer means it: a reading has to hold for
 * HOVER_SETTLE_MS before the map takes it, so a sweep across a hundred small
 * islands opens nothing and stopping on one opens that one. The hit test still
 * runs on every move — the cursor is drawn from it directly — and it is only the
 * *published* hover that waits.
 *
 * A click gets you it. One click, wherever the pointer is over land — the child
 * fill is hit-testable across the whole country, so the province resolves
 * whether or not its region is the one currently opened up. It pins the unit
 * *and* the point, which is what overlays/LocationPopup plants its marker on.
 * Clicking open water clears the selection; clicking land the finer tier does
 * not cover is neither, because there is nothing to resolve to and dropping the
 * selection over a lake would punish a near miss.
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
/**
 * @param enabled Whether the selected layer draws boundaries at all. A layer
 *   published only at stations has no polygon a click could resolve to, so the
 *   whole interaction is off rather than merely finding nothing: a hit test
 *   against layers that are hidden returns no features anyway, but it would
 *   still set the cursor, still run on every mousemove, and still clear the pin
 *   on a click over open water. Subscriptions stay mounted so the hook order
 *   does not change with the selection; they simply return.
 */
export function useBoundaryFocus(enabled = true) {
  const map = useRawMap()
  const { setHover, setPinned, setStation, hover, pinned } = useSelection()
  /** The reading a countdown is running towards, if one is. */
  const pending = useRef<{ key: string; timer: number } | null>(null)

  // `hover` and `pinned` are read straight from these closures rather than
  // through a ref: useMapEvent re-points its handler on every render, so a
  // handler always sees both as of the last commit. The published hover being
  // state rather than a second copy of it is what keeps this honest when
  // something *else* clears it — sources/AdminBoundaries does on a level change.
  const publishedKey = hoverKey(hover)

  const cancelPending = () => {
    if (!pending.current) return
    clearTimeout(pending.current.timer)
    pending.current = null
  }

  /**
   * Publish a hover once the pointer has held it for HOVER_SETTLE_MS.
   *
   * Trailing, and on the reading rather than on the event: a reading that comes
   * back to what is already on screen inside the window cancels itself and the
   * map never moves, which is the flicker gone. A reading that merely *repeats*
   * must not restart the clock, or a pointer moving 60 times a second would hold
   * its own hover off indefinitely — so the countdown is reset by a change of
   * target and by nothing else, and a sweep therefore commits nothing until it
   * slows down.
   */
  const report = (next: BoundaryHover) => {
    const key = hoverKey(next)

    if (key === publishedKey) {
      cancelPending()
      return
    }
    if (pending.current?.key === key) return

    cancelPending()
    pending.current = {
      key,
      timer: window.setTimeout(() => {
        pending.current = null
        setHover(next)
      }, HOVER_SETTLE_MS),
    }
  }

  /**
   * Publish now, dropping anything in flight: for the transitions the pointer
   * does not own, where the delay would be a bug rather than a courtesy.
   */
  const reportNow = (next: BoundaryHover) => {
    cancelPending()
    if (hoverKey(next) === publishedKey) return
    setHover(next)
  }

  useMapEvent('mousemove', (event) => {
    if (!map || !enabled) return
    const probed = probe(map, event.point)

    // An inline cursor on the canvas overrides MapLibre's own, which is CSS on
    // the container — so it has to be dropped while the map is moving, or a pan
    // that starts over a unit reads as "clickable" for its whole duration
    // instead of as grabbing. Written on every move rather than inside the
    // change guard below because a drag ends without one; assigning an
    // unchanged value is free.
    //
    // Set before the pin check on purpose: a click is live whether or not one is
    // held, and `location` is exactly what a click resolves to in both states.
    //
    // Read off this move's own hit test rather than off the settled hover below,
    // and so not delayed with it: the cursor's whole job is to say what a click
    // would do *now*, and a click acts on a fresh probe of its own. It is also
    // the one part of the hover the user is not going to see flicker, being
    // drawn under their pointer at the spot they are already looking.
    map.getCanvas().style.cursor =
      probed.location && !map.isMoving() ? 'pointer' : ''

    // The freeze. Nothing downstream hears the pointer again until the pin goes.
    if (pinned) return

    report(probed)
  })

  useMapEvent('click', (event) => {
    if (!map || onMarker(event.originalEvent)) return
    // With no boundaries there is nothing to resolve a click to, so the only
    // thing a click on the map itself can mean is "away from the station".
    if (!enabled) {
      setStation(null)
      return
    }
    // Deliberately a fresh hit test rather than the last hover: a click can
    // arrive from a touch or a keyboard-driven pointer that produced no
    // mousemove at all — and while a pin is held there is no hover to reuse.
    const { parent, location } = probe(map, event.point)

    // Only a unit at the product's own resolution can be pinned — a province
    // for the seasonal forecast — because the pin is what a request's
    // `location=` is built from, and asking for a region would return the wrong
    // shape of answer.
    if (location) {
      // `wrap()` because MapLibre renders copies of the world either side of the
      // real one: a click on the Philippines drawn at +360 reports a longitude
      // of ~481, which places a marker correctly and prints as nonsense.
      // Normalising here rather than at the readout keeps one canonical pin,
      // and the elastic pan limit means this only bites mid-drag anyway.
      const { lng, lat } = event.lngLat.wrap()
      setPinned({ ...location, lngLat: { lng, lat } })
      // Dropped in the same commit as the pin, so the frozen state is the empty
      // one: a hover left standing here would outrank the pin in
      // sources/AdminBoundaries and could never be corrected, the moves that
      // would clear it being the ones the freeze discards. Immediate, and
      // cancelling the settle in flight for the same reason — a countdown that
      // survived the click would land a hover *after* the pin, on the far side
      // of the freeze that was supposed to stop it.
      reportNow(NO_HOVER)
      return
    }

    // Leaving the country entirely is what clears a selection. Inside a parent
    // but on none of its children is not a deselection: it is the gap between
    // two provinces, or a sliver the child tier's generalized geometry gives up
    // at this zoom.
    if (!parent) {
      setPinned(null)
      setStation(null)
    }
  })

  // Leaving the canvas clears the reveal — including onto a floating panel,
  // which is a sibling of the map rather than a child of it, so the pointer
  // really has left. Which is the other half of what the pin is for: a panel
  // that has to keep showing a place reads `pinned`, not the hover.
  //
  // Settled like any other reading, not immediate: the panels float *over* the
  // canvas, so a pointer crossing the map on its way somewhere clips their
  // corners and leaves and re-enters within a frame or two. That is the island
  // flicker again in a different currency, and the same window absorbs it.
  useMapEvent('mouseout', () => {
    if (map) map.getCanvas().style.cursor = ''
    if (!enabled) return
    report(NO_HOVER)
  })

  /**
   * A selection cannot outlive the layer that could produce it.
   *
   * Switching to a station-only product leaves whatever was pinned standing,
   * and that pin would keep the boundary fills highlighting a province the map
   * no longer draws — and keep LocationPopup quoting a province forecast for a
   * quantity published only at stations. Cleared on the way out rather than
   * guarded at each reader, for the same reason useResetOnLevelChange clears on
   * a level change: the state is stale, not merely unused.
   */
  useEffect(() => {
    if (enabled) return
    setHover(NO_HOVER)
    setPinned(null)
    if (map) map.getCanvas().style.cursor = ''
    // The two setters are `useState`'s own and therefore stable, so listing them
    // costs nothing: this still runs only when the layer stops drawing
    // boundaries, not on every selection change.
  }, [enabled, map, setHover, setPinned])

  useEffect(() => {
    if (!map) return
    return () => {
      map.getCanvas().style.cursor = ''
      // A countdown must not outlive the map it was started over: it would fire
      // into an unmounted tree, and its reading names a unit from a style that
      // no longer exists.
      cancelPending()
    }
  }, [map])
}
