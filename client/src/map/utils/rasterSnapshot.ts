import chroma from 'chroma-js'
import type { RasterVariant } from '@/map/config/rasters'
import { loadRasterMetadata } from '@/map/hooks/useRasterImage'
import {
  SNAPSHOT_ASPECT,
  SNAPSHOT_FRAME,
  frameXToLng,
  frameYToLat,
} from './snapshotGeometry'

/**
 * A published raster as a thumbnail: painted, reprojected, and small.
 *
 * The surface on the map is painted on the GPU by weatherlayers-gl from a
 * full-resolution texture — 2477×3297 today, some 32 MB once decoded to RGBA.
 * Holding six of those for thumbnails a few dozen pixels wide would be absurd,
 * so this goes round the texture entirely: `createImageBitmap` decodes the WebP
 * and shrinks it in one step, and the palette is applied here on the CPU from
 * the same table the surface reads. The decoded full-size image is the
 * browser's to discard; only the result below is kept.
 *
 * The decode and the shrink are the whole cost — the colouring is 1–3 ms and
 * the encode about 1 — and both happen off the main thread. They used to run
 * as an `<img>` decode followed by a `drawImage` downscale, which measured 76 to
 * 124 ms of main-thread work per month, and six months of it landed as long
 * tasks while the map was painting its first surface.
 *
 * What matches the map, and why:
 *
 * - **The colours.** Every pixel goes through `scale.colorFor(value, mode)`
 *   under the variant's own mode — the call the popup swatch makes — so a
 *   thumbnail cannot show a class the surface does not.
 * - **The projection.** The image is equirectangular (weatherlayers samples it
 *   linearly in lng/lat), while the map is Web Mercator. Rows are resampled by
 *   latitude, so the country keeps the proportions it has on the map instead
 *   of stretching towards the north.
 * - **The coastline.** The surface has no data over the sea, so its own mask is
 *   the country's shape, and nothing else is drawn to supply one. Each pixel
 *   keeps the share of it that was land as its alpha, which is what gives the
 *   thumbnail an antialiased coast rather than a stair-stepped one.
 * - **The quantisation.** Values are decoded against the object's own
 *   `imageUnscale`, never a literal (docs/raster-layers.md §5).
 */

/**
 * Output width in pixels. About twice the width a card draws the map at, so it
 * stays sharp on a 2× display; the height follows from the frame.
 */
const WIDTH = 120
const HEIGHT = Math.round(WIDTH / SNAPSHOT_ASPECT)

/**
 * How much finer than the output the source is sampled before reprojecting.
 * The downsample itself is the browser's, and averages a whole footprint; this
 * only keeps the row resampling below from landing between two output rows.
 */
const OVERSAMPLE = 2

/**
 * The alpha below which a pixel is left empty.
 *
 * After the shrink, a coastal pixel is a blend of land, which has values, and
 * sea, which has none. Its alpha is how much of it was land, and — because
 * getImageData un-premultiplies — its red channel is the mean of the land
 * values alone, so even a thinly covered pixel carries a real reading. It is
 * painted in that reading's colour at that coverage, which antialiases the
 * coast. Below this floor the red channel is mostly rounding error, and a
 * pixel that faint would add nothing visible anyway.
 */
const MIN_ALPHA = 8

/**
 * The colour of each of the 256 quantised levels, for one variant and range.
 *
 * The red channel is a byte, so there are only ever 256 values to colour, and
 * resolving each once is what keeps the per-pixel loop to a table lookup.
 */
function levelColors(
  variant: RasterVariant,
  [min, max]: [number, number],
): Uint8Array {
  const table = new Uint8Array(256 * 3)
  for (let level = 0; level < 256; level++) {
    const value = min + (level / 255) * (max - min)
    const [r, g, b] = chroma(variant.scale.colorFor(value, variant.mode)).rgb()
    table.set([r, g, b], level * 3)
  }
  return table
}

/**
 * The image, decoded and already at `width`×`height`.
 *
 * Both steps run inside `createImageBitmap`, which decodes a Blob off the main
 * thread — measured in Chromium; Firefox and Safari are specified to do the
 * same but have not been profiled here. The options matter to the values, not
 * only to speed:
 *
 * - `premultiplyAlpha: 'premultiply'` makes the shrink average premultiplied
 *   pixels, so a no-data pixel contributes nothing to its neighbours' red
 *   channel instead of dragging every coastal value towards zero. See
 *   MIN_ALPHA for how that is read back.
 * - `colorSpaceConversion: 'none'` keeps the channel a number. The red byte is
 *   a quantised rainfall value, and any colour management applied to it would
 *   change the reading, not only the look.
 *
 * A browser that ignores the resize options hands back the image at full size.
 * Nothing breaks: the `drawImage` in `render` scales whatever it is given to the
 * same size, so such a browser only pays the old main-thread cost.
 */
async function decodeSmall(
  url: string,
  width: number,
  height: number,
  priority: RequestPriority,
): Promise<ImageBitmap> {
  // CORS, as for the `HEAD`: MinIO echoes the Origin in development and the
  // production proxy is same-origin, so the pixels are readable either way.
  const response = await fetch(url, { priority })
  if (!response.ok) {
    throw new Error(`Raster failed: ${response.status} ${response.statusText}`)
  }
  return createImageBitmap(await response.blob(), {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
    premultiplyAlpha: 'premultiply',
    colorSpaceConversion: 'none',
  })
}

async function render(
  url: string,
  variant: RasterVariant,
  priority: RequestPriority,
): Promise<string | null> {
  const metadata = await loadRasterMetadata(url)
  if (!metadata) return null
  const [west, south, east, north] = metadata.bounds

  // The source, decoded at a size where one source pixel is about one output
  // pixel over the frame. The image's bounds are wider than the frame — they
  // reach to the Kalayaan group in the west — so its size is scaled by how much
  // of it the frame covers.
  const frameWest = frameXToLng(SNAPSHOT_FRAME.x)
  const frameEast = frameXToLng(SNAPSHOT_FRAME.x + SNAPSHOT_FRAME.width)
  const frameNorth = frameYToLat(SNAPSHOT_FRAME.y)
  const frameSouth = frameYToLat(SNAPSHOT_FRAME.y + SNAPSHOT_FRAME.height)
  const sourceWidth = Math.max(
    1,
    Math.round((WIDTH * OVERSAMPLE * (east - west)) / (frameEast - frameWest)),
  )
  const sourceHeight = Math.max(
    1,
    Math.round(
      (HEIGHT * OVERSAMPLE * (north - south)) / (frameNorth - frameSouth),
    ),
  )

  const bitmap = await decodeSmall(url, sourceWidth, sourceHeight, priority)

  // Only to read the pixels back: a bitmap's are not addressable. At this size
  // the copy is a fraction of a millisecond.
  const source = document.createElement('canvas')
  source.width = sourceWidth
  source.height = sourceHeight
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) {
    bitmap.close()
    return null
  }
  sourceContext.imageSmoothingEnabled = true
  sourceContext.imageSmoothingQuality = 'high'
  sourceContext.drawImage(bitmap, 0, 0, sourceWidth, sourceHeight)
  bitmap.close()
  const pixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data

  const colors = levelColors(variant, metadata.imageUnscale)

  const output = document.createElement('canvas')
  output.width = WIDTH
  output.height = HEIGHT
  const outputContext = output.getContext('2d')
  if (!outputContext) return null
  const painted = outputContext.createImageData(WIDTH, HEIGHT)
  const target = painted.data

  // Columns are linear in longitude under both projections, so they are worked
  // out once; only rows need the Mercator inverse.
  const columns = new Int32Array(WIDTH)
  for (let i = 0; i < WIDTH; i++) {
    const lng = frameXToLng(
      SNAPSHOT_FRAME.x + ((i + 0.5) / WIDTH) * SNAPSHOT_FRAME.width,
    )
    columns[i] = Math.floor(((lng - west) / (east - west)) * sourceWidth)
  }

  for (let j = 0; j < HEIGHT; j++) {
    const lat = frameYToLat(
      SNAPSHOT_FRAME.y + ((j + 0.5) / HEIGHT) * SNAPSHOT_FRAME.height,
    )
    const row = Math.floor(((north - lat) / (north - south)) * sourceHeight)
    if (row < 0 || row >= sourceHeight) continue

    for (let i = 0; i < WIDTH; i++) {
      const column = columns[i]
      if (column < 0 || column >= sourceWidth) continue

      const from = (row * sourceWidth + column) * 4
      if (pixels[from + 3] < MIN_ALPHA) continue

      const level = pixels[from]
      const to = (j * WIDTH + i) * 4
      target[to] = colors[level * 3]
      target[to + 1] = colors[level * 3 + 1]
      target[to + 2] = colors[level * 3 + 2]
      target[to + 3] = pixels[from + 3]
    }
  }

  outputContext.putImageData(painted, 0, 0)
  return output.toDataURL('image/png')
}

export const rasterSnapshotKey = (url: string, variant: RasterVariant) =>
  `${url}#${variant.mode}`

/** Finished thumbnails, so a revisited card repaints in one render. */
export const settledSnapshots = new Map<string, string | null>()

/**
 * Which card asked. `high` is the step the map is showing; `low` is every
 * other card on the strip.
 */
export type SnapshotPriority = 'high' | 'low'

/**
 * How many background thumbnails may be in flight at once.
 *
 * Six months requested together would put six 64 kB downloads and six decodes
 * of an 8-megapixel image up against the main map's own first surface, which is
 * the one thing on the page a reader is waiting for. Two at a time keeps the
 * strip filling steadily without taking the network from it.
 */
const MAX_BACKGROUND = 2

type Entry = {
  promise: Promise<string | null>
  /** Starts the render; null once it has started. */
  start: ((priority: RequestPriority) => void) | null
  /** Cards currently waiting on this thumbnail. */
  holders: number
}

/**
 * Keyed by URL and mode. The URL already names the variant's prefix, and the
 * scale is fixed per prefix, so the mode is the one fact about how it is
 * painted that the URL does not carry.
 */
const entries = new Map<string, Entry>()

/** Keys waiting for a background slot, oldest first. */
const queue = new Set<string>()

let active = 0

function startNow(key: string, priority: RequestPriority) {
  const entry = entries.get(key)
  if (!entry?.start) return
  const start = entry.start
  entry.start = null
  queue.delete(key)
  start(priority)
}

function pump() {
  for (const key of queue) {
    if (active >= MAX_BACKGROUND) return
    startNow(key, 'low')
  }
}

function create(key: string, url: string, variant: RasterVariant): Entry {
  let start: Entry['start'] = null
  const promise = new Promise<string | null>((resolve, reject) => {
    start = (priority) => {
      active++
      render(url, variant, priority)
        .then(resolve, reject)
        .finally(() => {
          active--
          pump()
        })
    }
  }).then(
    (snapshot) => {
      settledSnapshots.set(key, snapshot)
      return snapshot
    },
    (error: unknown) => {
      // Evicted so the next visit retries rather than inheriting the failure.
      entries.delete(key)
      throw error
    },
  )

  const entry: Entry = { promise, start, holders: 0 }
  entries.set(key, entry)
  queue.add(key)
  return entry
}

/**
 * A painted thumbnail — a data URL, or null when CIS publishes no image for
 * the month, the same 404 posture useRasterImage takes — and a way to say the
 * card no longer wants it.
 *
 * The step on the map is rendered at once, at the browser's normal fetch
 * priority, and it jumps any queue: a card that becomes the selected one
 * mid-playback is started the moment it does. Every other card waits for one
 * of MAX_BACKGROUND slots and fetches at `low`, which is what keeps the strip
 * from competing with the main surface on first load.
 *
 * Releasing matters for the queue. A thumbnail no card is waiting on any more,
 * and whose render has not started, is dropped rather than run — so hiding the
 * strip, or switching layers, does not leave a backlog of work for images
 * nobody will see. One already under way is left to finish and is cached.
 */
export function requestRasterSnapshot(
  url: string,
  variant: RasterVariant,
  priority: SnapshotPriority,
): { promise: Promise<string | null>; release: () => void } {
  const key = rasterSnapshotKey(url, variant)
  const entry = entries.get(key) ?? create(key, url, variant)
  entry.holders++

  if (priority === 'high') startNow(key, 'auto')
  else pump()

  let released = false
  return {
    promise: entry.promise,
    release: () => {
      if (released) return
      released = true
      entry.holders--
      if (entry.holders === 0 && entry.start && entries.get(key) === entry) {
        entries.delete(key)
        queue.delete(key)
      }
    },
  }
}
