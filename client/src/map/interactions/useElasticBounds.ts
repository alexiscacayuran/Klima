import { useCallback, useRef } from 'react'
import type { LngLatBoundsLike } from 'maplibre-gl'
import { useMapInstance } from '@/map/hooks/useMapInstance'
import { useMapEvent } from '@/map/hooks/useMapEvent'

/** Degrees of slop below which a correction is not worth animating. */
const EPSILON = 1e-4

const SPRING_DURATION_MS = 520

/**
 * Ease-out with a slight overshoot, so the map settles like a released spring
 * rather than sliding to a stop.
 *
 * The overshoot travels further *inside* the bounds and comes back, so it never
 * re-exposes the out-of-bounds area. `c1` is the springiness — raise it for more
 * bounce, drop it to 0 for a plain ease-out.
 */
export function springEase(t: number): number {
  const c1 = 1.2
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/**
 * Offset along one axis needed to bring the viewport span [lo, hi] back inside
 * [limitLo, limitHi].
 *
 * Two regimes, because one rule cannot serve both zoom extremes:
 *
 * - Viewport narrower than the limit (zoomed in): hold the viewport's *edges*
 *   inside the limit, so you cannot pan the country off screen.
 * - Viewport wider than the limit (zoomed out): no camera can satisfy both
 *   edges, so hold the viewport's *centre* inside instead. Pinning to an edge
 *   here would be unreachable, and recentring would freeze the axis entirely —
 *   at the initial fit a wide window already spans ~40° of longitude against a
 *   ~20° limit, so edge-holding would make the map unpannable east-west.
 *
 * Exported for testing; the hook is the intended entry point.
 */
export function boundsCorrection(
  lo: number,
  hi: number,
  limitLo: number,
  limitHi: number,
): number {
  if (hi - lo < limitHi - limitLo) {
    if (lo < limitLo) return limitLo - lo
    if (hi > limitHi) return limitHi - hi
    return 0
  }

  const center = (lo + hi) / 2
  if (center < limitLo) return limitLo - center
  if (center > limitHi) return limitHi - center
  return 0
}

/**
 * Sticky panning: the camera may be dragged outside `bounds`, and springs back
 * once the gesture settles.
 *
 * MapLibre's own <Map maxBounds> is a hard clamp — the camera simply stops at
 * the edge — so this deliberately runs *instead of* maxBounds, not alongside it.
 * Setting both would mean the clamp wins and the spring never has anything to
 * correct.
 *
 * Correction happens on `moveend`, which fires after drag inertia has already
 * settled, so a fling is followed all the way out and then reeled back rather
 * than being cut short mid-throw.
 *
 * Note this is release-elasticity, not drag-time resistance: the map tracks the
 * pointer 1:1 while dragging. Damping mid-drag would mean replacing MapLibre's
 * DragPanHandler, which computes the camera from the pointer delta each frame.
 */
export function useElasticBounds(bounds: LngLatBoundsLike): void {
  const map = useMapInstance()
  // Marks the moveend that our own easeTo is about to emit, so the correction
  // does not retrigger itself. A ref, not state — nothing renders on it.
  const selfCorrecting = useRef(false)

  const settle = useCallback(() => {
    if (!map) return

    // Consume the moveend produced by our own correction.
    if (selfCorrecting.current) {
      selfCorrecting.current = false
      return
    }

    const [[limitWest, limitSouth], [limitEast, limitNorth]] = bounds as [
      [number, number],
      [number, number],
    ]
    const view = map.getBounds()

    const dLng = boundsCorrection(view.getWest(), view.getEast(), limitWest, limitEast)
    const dLat = boundsCorrection(view.getSouth(), view.getNorth(), limitSouth, limitNorth)

    if (Math.abs(dLng) < EPSILON && Math.abs(dLat) < EPSILON) return

    const center = map.getCenter()
    selfCorrecting.current = true
    map.easeTo({
      // Shifting the centre by the viewport's overhang is exact in longitude
      // and near-exact in latitude; Mercator makes the latter drift slightly at
      // high latitudes, which is far outside this map's range.
      center: [center.lng + dLng, center.lat + dLat],
      duration: SPRING_DURATION_MS,
      easing: springEase,
    })
  }, [map, bounds])

  useMapEvent('moveend', settle)
}
