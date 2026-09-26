import { PHILIPPINES_BOUNDS } from '@/map/config/viewState'
import type { AdminLevel } from '@/map/types/features'
import {
  coveringTile,
  fetchNationalLayer,
  latToTileY,
  lngToTileX,
} from './nationalTile'

/**
 * The geometry a choropleth snapshot is drawn from — its units, as SVG path
 * data — and the frame every snapshot, raster or choropleth, is drawn in.
 *
 * A raster snapshot uses the frame and nothing else: the surface carries the
 * country's shape in its own no-data mask, so no boundary geometry is fetched
 * for it at all (see controls/StepSnapshot).
 *
 * Read through the same whole-country tile fetch the label anchors use
 * (utils/nationalTile), so the thumbnails cost no Martin source of their own and
 * one request per level for the life of the page — though from a shallower tile
 * than the labels read; see SNAPSHOT_TILE.
 *
 * Coordinates are left in the tile's own space rather than converted to
 * lng/lat. A vector tile is already Web Mercator, which is the projection the
 * main map draws in, so a thumbnail in tile units is the map's own shape at
 * a smaller size — and SVG scales it with a viewBox rather than with arithmetic
 * per vertex.
 */

/**
 * Every snapshot's coordinate space: tile units at this extent.
 *
 * Martin publishes 4096, the MVT default. A layer that arrives at another
 * extent is rescaled onto this one, so the frame below never depends on what
 * the server happened to send.
 */
const EXTENT = 4096

/**
 * The shallowest tile that still holds the whole country — z2/3/1 — rather
 * than the deepest one the labels read.
 *
 * A thumbnail is about 112 device pixels wide on a 2× screen, and a z2 tile
 * still gives it four tile units per device pixel across the country, so the
 * deeper tile's extra detail is detail no card can show. Martin generalises
 * below z9, so asking for the shallower tile is where the thinning happens:
 * measured against the live server, the level-1 tile is 7,908 vertices in
 * 18 kB at z2, against 16,988 in 37 kB at z4.
 */
const SNAPSHOT_ZOOM = 2

const SNAPSHOT_TILE = coveringTile(
  PHILIPPINES_BOUNDS as readonly [number, number][],
  SNAPSHOT_ZOOM,
)

/** The tile-unit coordinate of a lng/lat inside SNAPSHOT_TILE. */
function toFrame(lng: number, lat: number) {
  const { z, x, y } = SNAPSHOT_TILE
  return {
    x: (lngToTileX(lng, z) - x) * EXTENT,
    y: (latToTileY(lat, z) - y) * EXTENT,
  }
}

/** Tile units back to latitude — the inverse of the Mercator y above. */
export function frameYToLat(frameY: number): number {
  const { z, y } = SNAPSHOT_TILE
  const worldY = (y + frameY / EXTENT) / 2 ** z
  const n = Math.PI - 2 * Math.PI * worldY
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Tile units back to longitude. */
export function frameXToLng(frameX: number): number {
  const { z, x } = SNAPSHOT_TILE
  return ((x + frameX / EXTENT) / 2 ** z) * 360 - 180
}

/**
 * The box every snapshot is framed on: PHILIPPINES_BOUNDS, the same framing
 * target the main map fits on load, so a thumbnail and the map it previews
 * show the country at one proportion.
 */
export const SNAPSHOT_FRAME = (() => {
  const [[west, south], [east, north]] = PHILIPPINES_BOUNDS as [
    [number, number],
    [number, number],
  ]
  const topLeft = toFrame(west, north)
  const bottomRight = toFrame(east, south)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
})()

/** `x y width height`, ready for an SVG viewBox. */
export const SNAPSHOT_VIEWBOX = [
  SNAPSHOT_FRAME.x,
  SNAPSHOT_FRAME.y,
  SNAPSHOT_FRAME.width,
  SNAPSHOT_FRAME.height,
]
  .map((n) => n.toFixed(1))
  .join(' ')

/** Width over height — about 0.57, because the country is tall. */
export const SNAPSHOT_ASPECT = SNAPSHOT_FRAME.width / SNAPSHOT_FRAME.height

export type SnapshotUnit = {
  /** The 10-character PSGC, the join key the API's values carry. */
  psgc: string
  /** Every ring of the unit, as one path; filled with the nonzero rule. */
  path: string
}

export type SnapshotShapes = {
  units: SnapshotUnit[]
}

export const EMPTY_SHAPES: SnapshotShapes = { units: [] }

/**
 * The least distance, in tile units, between two vertices that are both kept.
 *
 * About half a device pixel on a 2× screen, and three quarters on a 3× one —
 * so what is dropped is never a step anyone could see, only the vertices
 * Martin's tile keeps for a map a hundred times the size.
 */
const MIN_STEP = 2

/**
 * A ring smaller than this across in both directions is dropped whole: an islet
 * under a device pixel, which at thumbnail size is antialiasing and nothing
 * more. The archipelago has hundreds of them, and together they are a large
 * share of the path.
 */
const MIN_RING = 2

/**
 * A feature's rings as path data, thinned to what a thumbnail can show.
 *
 * Radial-distance thinning rather than Douglas–Peucker: the tile has already
 * been generalised by Martin, so what is left to remove is the run of vertices
 * packed closer than a pixel apart, and a single pass that skips them is all
 * that takes. Rounded to whole units, the tile's own resolution.
 */
function ringsToPath(
  rings: { x: number; y: number }[][],
  scale: number,
): string {
  let d = ''
  for (const ring of rings) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of ring) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    if (Math.max(maxX - minX, maxY - minY) * scale < MIN_RING) continue

    const kept: string[] = []
    let lastX = NaN
    let lastY = NaN
    for (const point of ring) {
      const x = Math.round(point.x * scale)
      const y = Math.round(point.y * scale)
      if (Math.hypot(x - lastX, y - lastY) < MIN_STEP) continue
      kept.push(`${x} ${y}`)
      lastX = x
      lastY = y
    }
    // A ring thinned below a triangle has no area left to fill.
    if (kept.length < 3) continue
    d += `M${kept.join('L')}Z`
  }
  return d
}

async function load(level: AdminLevel): Promise<SnapshotShapes> {
  const layer = await fetchNationalLayer(level, undefined, SNAPSHOT_TILE)
  if (!layer) return EMPTY_SHAPES

  const scale = EXTENT / layer.extent
  const units: SnapshotUnit[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const path = ringsToPath(feature.loadGeometry(), scale)
    if (path) units.push({ psgc: String(feature.properties.psgc), path })
  }

  return { units }
}

/**
 * Per level, for the page's life: the boundaries do not move during a session
 * (see hooks/useLabelAnchors for the same reasoning). A failure is evicted so a
 * later mount retries rather than inheriting it.
 */
const cache = new Map<AdminLevel, Promise<SnapshotShapes>>()

/** The same answers, already settled — so a remount paints without a frame of empty. */
export const settledShapes = new Map<AdminLevel, SnapshotShapes>()

export function loadSnapshotShapes(level: AdminLevel): Promise<SnapshotShapes> {
  const cached = cache.get(level)
  if (cached) return cached

  const pending = load(level)
    .then((shapes) => {
      settledShapes.set(level, shapes)
      return shapes
    })
    .catch((error: unknown) => {
      cache.delete(level)
      throw error
    })
  cache.set(level, pending)
  return pending
}
