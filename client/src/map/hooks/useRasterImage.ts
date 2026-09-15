import { useEffect, useState } from 'react'
import { loadTextureData } from 'weatherlayers-gl/client'
import type { TextureData } from 'weatherlayers-gl/client'

/**
 * One decoded raster surface, with the georeferencing that travels beside it.
 *
 * A WebP carries no bounds and no record of the range its R channel was
 * quantised against, so both arrive as object metadata and both have to be read
 * before the pixels mean anything (docs/raster-layers.md §5).
 */
export type RasterImage = {
  image: TextureData
  /** `[west, south, east, north]`, as the object states it. */
  bounds: [number, number, number, number]
  /** The range the R channel was quantised against — `[0,250]` %, `[0,1500]` mm. */
  imageUnscale: [number, number]
}

export type RasterImageState =
  /** No URL to load: no raster variant selected, or no issuance resolved yet. */
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; image: RasterImage }
  /**
   * CIS publishes no image for this month. A `404`, and not an error state worth
   * surfacing — the same posture docs/cis-api.md §6 takes toward provinces with
   * no data. It happens for real: rasters exist only from the 2026-08-26
   * issuance onward, and earlier issuances have COGs but no WebP.
   */
  | { status: 'none' }
  | { status: 'error'; error: Error }

/**
 * A raster surface, decoded and ready to paint.
 *
 * **Keyed on the URL string and nothing else**, as docs/raster-layers.md §8
 * asks. That string is already the cache key inside `loadTextureData`, so any
 * further dependency here would only create a way for the two caches to
 * disagree about what is loaded.
 *
 * The cache below is what makes the timeline free. The whole issuance names six
 * images and a scrub walks between them, so the second visit to a month — and
 * every frame of playback after the first pass — is a map lookup rather than a
 * request, which is the raster counterpart of useSeasonalForecast fetching the
 * whole issuance rather than the scrubbed month.
 */
const cache = new Map<string, Promise<RasterImage | null>>()

/**
 * The same answers, already settled.
 *
 * A promise cannot be read synchronously, and a month that is merely *resolved*
 * still costs a microtask to observe — long enough for React to paint one frame
 * of `loading` and blink the surface off on the way back to a month already
 * decoded. This map is what lets a revisit repaint in the same render.
 */
const settled = new Map<string, RasterImage | null>()

/** Sentinel for a `404`: cached like a hit, so a missing month is asked for once. */
const NOT_PUBLISHED = null

/**
 * Metadata first, pixels second.
 *
 * Two requests per image, and the `HEAD` is not avoidable: `loadTextureData`
 * loads through `img.crossOrigin = 'anonymous'; img.src = url` rather than a
 * `fetch`, so no response header is visible to it and nothing in its result
 * carries the bounds (§7). Passing `headers` would switch it to fetch + blob
 * URL and still return only `{data, width, height}`.
 *
 * The values are read rather than written down on purpose. CIS will raise a
 * bound on evidence of clipped pixels, which re-quantises every image published
 * afterwards while older ones keep the old range — a hardcoded `imageUnscale`
 * then misreports rainfall by hundreds of millimetres with nothing on screen to
 * suggest anything is wrong (§5).
 */
async function load(url: string): Promise<RasterImage | null> {
  const head = await fetch(url, { method: 'HEAD' })
  if (head.status === 404) return NOT_PUBLISHED
  if (!head.ok) {
    throw new Error(`Raster metadata failed: ${head.status} ${head.statusText}`)
  }

  const bounds = readJsonHeader(head, 'x-amz-meta-weatherlayers-bounds')
  const imageUnscale = readJsonHeader(
    head,
    'x-amz-meta-weatherlayers-image-unscale',
  )

  // Not a 404 and not paintable either: the object is there but says nothing
  // about where it belongs, which would otherwise be drawn over the equator off
  // the west coast of Africa.
  if (!bounds || bounds.length !== 4 || !imageUnscale || imageUnscale.length !== 2) {
    throw new Error(`Raster is missing its georeferencing metadata: ${url}`)
  }

  const image = await loadTextureData(url)
  return {
    image,
    bounds: bounds as [number, number, number, number],
    imageUnscale: imageUnscale as [number, number],
  }
}

/** A numeric JSON array from a response header, or null if absent or malformed. */
function readJsonHeader(response: Response, name: string): number[] | null {
  const raw = response.headers.get(name)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((n) => typeof n === 'number')
      ? parsed
      : null
  } catch {
    return null
  }
}

function loadCached(url: string): Promise<RasterImage | null> {
  const cached = cache.get(url)
  if (cached) return cached

  // Not given a signal: the entry is shared, so one consumer stepping off this
  // month must not cancel the decode another is waiting on. A failure is
  // evicted so the next visit retries rather than inheriting the first outage.
  const pending = load(url)
    .then((image) => {
      settled.set(url, image)
      return image
    })
    .catch((error: unknown) => {
      cache.delete(url)
      throw error
    })
  cache.set(url, pending)
  return pending
}

/**
 * Warm the cache for a URL without subscribing to it.
 *
 * The whole issuance is known as soon as the timeline is, so the next month's
 * image can decode while the current one is on screen — the analogue of
 * useSeasonalForecast fetching every month in one request, and what keeps the
 * first press of play from stuttering.
 *
 * Failures are swallowed: a prefetch that misses costs the real load nothing
 * except the retry it would have done anyway.
 */
export function prefetchRasterImage(url: string | null): void {
  if (!url) return
  void loadCached(url).catch(() => {})
}

export function useRasterImage(url: string | null): RasterImageState {
  const [state, setState] = useState<RasterImageState>({ status: 'idle' })

  useEffect(() => {
    if (!url) {
      setState({ status: 'idle' })
      return
    }

    // A month already decoded repaints in this render rather than passing
    // through `loading`, so scrubbing back over visited months — and every frame
    // of playback after the first pass — does not blink the surface off.
    if (settled.has(url)) {
      const image = settled.get(url) ?? null
      setState(image ? { status: 'ready', image } : { status: 'none' })
      return
    }

    let live = true
    setState({ status: 'loading' })

    loadCached(url)
      .then((image) => {
        if (!live) return
        setState(image ? { status: 'ready', image } : { status: 'none' })
      })
      .catch((error: unknown) => {
        if (!live) return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => {
      live = false
    }
  }, [url])

  return state
}
