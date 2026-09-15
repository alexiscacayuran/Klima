import { useEffect, useRef, useState } from 'react'
import { useControl } from '@vis.gl/react-maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ImageType, RasterLayer } from 'weatherlayers-gl'

import { LAYER_IDS } from '@/map/config/constants'
import {
  rasterPalette,
  rasterUrl,
  rasterVariantFor,
} from '@/map/config/rasters'
import type { RasterVariant } from '@/map/config/rasters'
import { useIssuance } from '@/map/hooks/useIssuance'
import { prefetchRasterImage, useRasterImage } from '@/map/hooks/useRasterImage'
import type { RasterImage, RasterImageState } from '@/map/hooks/useRasterImage'
import { useTimeline } from '@/map/hooks/useTimeline'
import { useMapSettings } from '@/map/state/useMapSettings'
import { useSelection } from '@/map/state/useSelection'

/**
 * The continuous field under the boundaries.
 *
 * The third leg of the CIS contract (docs/raster-layers.md): Martin draws the
 * geometry, the API fills the provinces, and this paints the interpolated
 * surface both were derived from — so the choropleth and the field beneath it
 * are two readings of one issuance and cannot drift apart on screen.
 *
 * ## Why deck.gl is here at all
 *
 * The images are a value quantised into the red channel, not a picture: 256
 * levels across a range the object states in its own metadata. Painting them
 * means applying a palette to that channel, and maplibre-gl 5.24 has no
 * `raster-color` — the property Mapbox GL v3 added for exactly this and
 * MapLibre has not adopted. So the palette is applied on the GPU by
 * weatherlayers-gl's RasterLayer, and deck.gl is what hosts it.
 *
 * **`interleaved: true` is load-bearing, not a preference.** Overlaid mode puts
 * deck on its own canvas above the map, which would bury the boundary strokes
 * and every place name under the surface they are supposed to be read over.
 * Interleaved shares MapLibre's WebGL context and honours `beforeId`, which is
 * what lets the layer take the slot LAYER_ORDER reserves for it.
 *
 * ## One overlay, N layers
 *
 * Exactly one MapboxOverlay exists in the app, and it is this. Two would fight
 * over the GL context. Seasonal is the only product publishing rasters today,
 * but it is not expected to stay that way, so this component resolves *which*
 * surface to draw from config rather than naming one: a second product adds a
 * RasterSource and a RasterVariant in config/rasters.ts and arrives here
 * already working.
 */

/**
 * How long a month takes to become the next one.
 *
 * Shorter than TimelineBar's own 1200ms dwell by enough that playback reads as
 * a sequence of months rather than a continuous morph — these are six separate
 * monthly aggregates, and a fade that outlasted the step would imply a
 * continuum between them that the forecast does not claim.
 */
const CROSS_FADE_MS = 220

/** What the layer is told to draw, once the fade has had its say. */
type Surface = {
  /**
   * The variant these images came from — carried with them rather than read
   * live off the selection.
   *
   * This is what makes it safe to keep a surface on screen while the next one
   * loads. Switch from percent-of-normal to millimetres and the selection's
   * variant changes immediately while the image does not, so a layer painting
   * the held image with the *newly* selected palette would decode a 0–250 %
   * field against a 0–500 mm ramp for as long as the fetch took. Pinning the
   * two together means a held surface is always self-consistent, and the map
   * never has to blink empty to stay honest.
   */
  variant: RasterVariant
  /** The outgoing image at weight 0, and the settled one otherwise. */
  image: RasterImage
  /** The incoming image, or null when nothing is in flight. */
  image2: RasterImage | null
  /** 0 shows `image`, 1 shows `image2`; between them the *values* are blended. */
  imageWeight: number
}

export function RasterOverlay() {
  const { variable, date } = useSelection()
  const { visibleLayers } = useMapSettings()
  const { steps } = useTimeline()

  const variant = rasterVariantFor(variable)
  const issuance = useIssuance(variant?.product)
  const issuedAt = issuance.status === 'ready' ? issuance.issuedAt : null

  const url = variant && date && issuedAt ? rasterUrl(variant, date, issuedAt) : null
  const state = useRasterImage(url)

  // The next month decodes while this one is on screen. The issuance names all
  // six images at once, so the only cost of being ready for the next step is
  // asking early — which is what keeps the first press of play from stuttering.
  useEffect(() => {
    if (!variant || !issuedAt || !date) return
    const index = steps.findIndex((step) => step.id === date)
    const next = index >= 0 ? steps[index + 1] : undefined
    if (next) prefetchRasterImage(rasterUrl(variant, next.id, issuedAt))
  }, [variant, issuedAt, date, steps])

  const surface = useCrossFade(state, variant)

  const visible = visibleLayers[LAYER_IDS.raster] ?? true

  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ interleaved: true, layers: [] }),
  )

  useEffect(() => {
    // No variant, no issuance, a month CIS published nothing for, or the layer
    // switched off: the surface clears rather than going stale under a product
    // it is not about. An empty list is the whole of "draw nothing" — the
    // overlay itself stays mounted, because tearing it down and rebuilding it
    // would re-acquire the GL context on every product change.
    if (!surface || !visible) {
      overlay.setProps({ layers: [] })
      return
    }

    overlay.setProps({
      layers: [
        new RasterLayer({
          id: LAYER_IDS.raster,
          image: surface.image.image,
          image2: surface.image2?.image ?? null,
          imageWeight: surface.imageWeight,
          imageType: ImageType.SCALAR,
          // Both from the object's own metadata, never a literal: CIS will
          // raise a bound, which re-quantises everything published afterwards
          // while older images keep the old range (docs/raster-layers.md §5).
          imageUnscale: surface.image.imageUnscale,
          bounds: surface.image.bounds,
          // The surface's own variant, not the selected one — see the note on
          // Surface. The same table the choropleth and the popup swatch read,
          // so one value cannot be two colours. See config/rasters.ts.
          palette: rasterPalette(surface.variant.scale),
          opacity: surface.variant.opacity,
          // The slot LAYER_ORDER reserves: directly under the land, so the
          // country reads as a tint over the surface and the surface continues
          // past the coast untinted — which is the whole of how this map
          // separates land from sea. Under the boundary strokes by consequence,
          // so administrative edges stay readable over the data.
          beforeId: LAYER_IDS.land,
        }),
      ],
    })
  }, [overlay, surface, visible])

  return null
}

/**
 * Holds the outgoing image against the incoming one and blends between them.
 *
 * The blend is on the *value* before the palette is applied, not on two painted
 * images — which is the whole reason this runs through RasterLayer rather than
 * two stacked MapLibre layers cross-faded on opacity. A month at 60% of the way
 * to the next reads as a plausible rainfall field; the same two months blended
 * as colour reads as neither.
 *
 * Two things are deliberately not faded:
 *
 * - **A change of variant.** `imageUnscale` applies to both images at once, so
 *   blending millimetres against percent-of-normal would decode one of them
 *   against the other's range and paint a number that was never forecast.
 * - **Reduced motion.** A user who has asked for less of it gets the new month
 *   directly, the same posture TimelineBar takes toward playback.
 */
function useCrossFade(
  state: RasterImageState,
  variant: RasterVariant | null,
): Surface | null {
  const [surface, setSurface] = useState<Surface | null>(null)

  // Read through refs so the effect below depends on the incoming image alone.
  // Depending on the surface it sets would restart the animation it just
  // scheduled, and the fade would never finish.
  const surfaceRef = useRef<Surface | null>(null)
  surfaceRef.current = surface
  const variantRef = useRef<RasterVariant | null>(null)

  const status = state.status
  const image = state.status === 'ready' ? state.image : null

  useEffect(() => {
    const previousVariant = variantRef.current

    // **Hold, do not clear.** A surface that is still decoding is the one state
    // where the last one has to stay up: stepping the timeline changes the URL,
    // which puts useRasterImage back into `loading` for as long as the fetch
    // takes. Clearing here would blink the map bare between every pair of
    // months *and* throw away the image the fade needs to start from, so the
    // cross-fade would never once run on a month being seen for the first time.
    //
    // Safe across a variant change too, because the held surface carries the
    // variant it was painted with. See the note on Surface.
    if (status === 'loading') return

    variantRef.current = variant

    // Everything else with no image genuinely has nothing to draw: no variant
    // selected, no issuance resolved, a month CIS published no raster for
    // (docs/raster-layers.md §4), or a failed load.
    if (!image) {
      setSurface(null)
      return
    }

    // Guarded for the type, though an image cannot exist without the variant
    // whose URL fetched it.
    if (!variant) {
      setSurface(null)
      return
    }

    const settled = surfaceRef.current
    const sameVariant = previousVariant === variant
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (!settled || !sameVariant || reduced) {
      setSurface({ variant, image, image2: null, imageWeight: 0 })
      return
    }

    // The image the last fade was heading towards, not the one it started from:
    // scrubbing faster than the fade would otherwise blend back out of a month
    // the user has already stepped past.
    const from = settled.image2 ?? settled.image
    if (from === image) return

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min((now - start) / CROSS_FADE_MS, 1)
      if (t < 1) {
        setSurface({ variant, image: from, image2: image, imageWeight: t })
        frame = requestAnimationFrame(tick)
        return
      }
      // Settle onto the new image alone, so the outgoing one stops being
      // uploaded as a texture the moment it stops being visible.
      setSurface({ variant, image, image2: null, imageWeight: 0 })
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [image, status, variant])

  return surface
}
