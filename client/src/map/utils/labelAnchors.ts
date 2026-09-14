import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import type { Point } from 'geojson'
import {
  BOUNDARIES_SOURCE_LAYER,
  MARTIN_SOURCES,
  tileUrlAt,
} from '@/map/config/martin'
import { PHILIPPINES_BOUNDS } from '@/map/config/viewState'
import type { AdminLevel } from '@/map/types/features'

/**
 * One label point per administrative unit.
 *
 * MapLibre cannot place a polygon label once. Given a polygon it takes every
 * outer ring and labels each at that ring's pole of inaccessibility
 * (symbol/symbol_layout.ts), which for an archipelago is a catastrophe rather
 * than an inconvenience: against the live tiles, the 86 level-2 features carry
 * 553 outer rings, and Palawan alone is 116 of them. Every one of those is a
 * "Palawan" competing for space, and collision detection then keeps an
 * arbitrary handful — so the name of a province appears several times over,
 * scattered across its islets, and not necessarily on the province itself.
 * Tile clipping adds the same problem again along tile seams.
 *
 * Neither is fixable in the style. A symbol layer places one label per feature
 * only if the feature is a *point*, so the fix is to stop asking a polygon
 * source for labels and give the label layer a point source of its own — one
 * point per unit, which is what this builds.
 *
 * The right place for this is the tile: `ST_PointOnSurface` of the largest part,
 * published as a column, at which point this whole file collapses into a second
 * `<Layer>`. docs/vector-tiles.md publishes no such column and Martin belongs to
 * the CIS stack rather than to this repo, so the client derives it instead.
 */

/** What a label needs to know about the unit it names. */
export type LabelAnchorProperties = {
  /** The 10-character PSGC. The same join key the boundary tiles carry. */
  psgc: string
  name: string
  /** Parent's PSGC; null at level 1. Kept so a label can be filtered by parent. */
  parent_psgc: string | null
  /**
   * `Reg` | `Prov` | `Mun` | `City` — the unit's own kind, which is not the same
   * question as the level it was fetched at (see AdminBoundaryProperties).
   *
   * Carried because the label layer ranks on it: level 3 holds 149 cities among
   * 1492 municipalities, and when they collide the city is the one a reader is
   * more likely to be looking for.
   */
  geo_level: string
}

export type LabelAnchorCollection = {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    geometry: Point
    properties: LabelAnchorProperties
  }[]
}

export const EMPTY_ANCHORS: LabelAnchorCollection = {
  type: 'FeatureCollection',
  features: [],
}

/** A vertex in tile-local coordinates, as loadGeometry returns them. */
type Vertex = { x: number; y: number }

/** An outer ring followed by the holes that belong to it. */
type Polygon = Vertex[][]

/**
 * Signed area, doubled — the sign is the only part that matters here.
 *
 * MVT winds exterior rings one way and holes the other, in a y-down coordinate
 * system, so the sign is what separates an island from a lake in it. Comparing
 * magnitudes is what picks the island a unit should be labelled on.
 */
function signedArea(ring: Vertex[]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y)
  }
  return sum / 2
}

/**
 * Splits a feature's rings into polygons, the way MVT emits them: an exterior
 * ring, then its holes, then the next exterior ring.
 */
function toPolygons(rings: Vertex[][]): Polygon[] {
  const polygons: Polygon[] = []
  for (const ring of rings) {
    if (signedArea(ring) > 0 || polygons.length === 0) {
      polygons.push([ring])
    } else {
      polygons[polygons.length - 1].push(ring)
    }
  }
  return polygons
}

/** How many horizontal cuts to try when looking for the widest span. */
const SCANLINES = 15

/**
 * A point guaranteed to be *inside* the polygon, near its middle.
 *
 * The centroid is not usable: a province shaped like Palawan or Quezon has one
 * outside its own coastline, and a label there is a label in the sea. This is
 * PostGIS's `ST_PointOnSurface` in miniature — cut the polygon with a horizontal
 * line, take the widest stretch of interior the line crosses, and stand in the
 * middle of it — repeated over several heights so the answer lands in the
 * broadest part of the shape rather than in whichever sliver the midline hit.
 *
 * Holes are included in the crossings, so a lake splits the span it sits in
 * rather than being labelled as land.
 */
function pointOnSurface(polygon: Polygon): Vertex {
  const [outer] = polygon
  let top = Infinity
  let bottom = -Infinity
  for (const { y } of outer) {
    if (y < top) top = y
    if (y > bottom) bottom = y
  }

  let best: Vertex = outer[0]
  let widest = -1

  for (let step = 1; step <= SCANLINES; step++) {
    const y = top + ((bottom - top) * step) / (SCANLINES + 1)

    const crossings: number[] = []
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j]
        const b = ring[i]
        // Half-open test, so a vertex exactly on the scanline counts once.
        if (a.y <= y === b.y <= y) continue
        crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    crossings.sort((p, q) => p - q)

    // Crossings alternate outside/inside, so interior spans are the pairs.
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const width = crossings[i + 1] - crossings[i]
      if (width > widest) {
        widest = width
        best = { x: (crossings[i] + crossings[i + 1]) / 2, y }
      }
    }
  }

  return best
}

/** Tile-local coordinates to lng/lat, inverting the Web Mercator projection. */
function toLngLat(
  { x, y }: Vertex,
  tile: { z: number; x: number; y: number },
  extent: number,
): [number, number] {
  const scale = 2 ** tile.z
  const worldX = (tile.x + x / extent) / scale
  const worldY = (tile.y + y / extent) / scale
  const n = Math.PI - 2 * Math.PI * worldY

  return [
    worldX * 360 - 180,
    (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  ]
}

const lngToTileX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z

const latToTileY = (lat: number, z: number) => {
  const sin = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** z
}

/**
 * The deepest single tile that still holds the whole country.
 *
 * One tile is the requirement, not an optimisation: a unit split across two
 * tiles arrives as two features with two largest-parts and would be labelled
 * twice, which is half of the bug this file exists to remove. Deepest, because
 * a tile's 4096 coordinate units are spread over its own span — the smaller the
 * tile, the finer the geometry it can express.
 *
 * For PHILIPPINES_BOUNDS this resolves to z4/13/7: about 600m per unit, against
 * a label that only has to land inside a province.
 */
function coveringTile(bounds: readonly [number, number][], maxZoom: number) {
  const [[west, south], [east, north]] = bounds
  let deepest = { z: 0, x: 0, y: 0 }

  for (let z = 0; z <= maxZoom; z++) {
    const x = Math.floor(lngToTileX(west, z))
    const y = Math.floor(latToTileY(north, z))
    if (x !== Math.floor(lngToTileX(east, z))) break
    if (y !== Math.floor(latToTileY(south, z))) break
    deepest = { z, x, y }
  }

  return deepest
}

/**
 * Deep enough to be precise, shallow enough that the tile is one request.
 *
 * Capped well below the source's own maxzoom because the cap is not what
 * decides the answer — the country's own extent is — and leaving it open would
 * only invite a future, smaller `bounds` to pick a zoom whose tile the server
 * generalises out of existence.
 */
const MAX_ANCHOR_ZOOM = 6

const ANCHOR_TILE = coveringTile(
  PHILIPPINES_BOUNDS as readonly [number, number][],
  MAX_ANCHOR_ZOOM,
)

/**
 * One point per unit at `level`, from a single tile.
 *
 * Each unit is labelled on its largest island. That is a decision, not a
 * fallback: a name belongs on the part of a place people recognise it by, and
 * the alternative — the whole feature's centre — puts "Palawan" in the Sulu Sea
 * and "Romblon" in open water between its three islands.
 *
 * Every level the server answers at ANCHOR_TILE's zoom works here, and that is
 * the whole requirement — there is no list of supported levels to keep in step
 * with the server. There was one, and it was wrong the moment Martin began
 * serving `adm3_municities` at every zoom: level 3 used to return an empty tile
 * below z8 while ANCHOR_TILE sits at z4, so the only honest answer for it was no
 * anchors at all, and the gate that said so then went on saying it afterwards.
 * A level the server does not carry at this zoom now yields an empty tile and,
 * from that, no labels — the same outcome, arrived at by asking rather than by
 * remembering.
 *
 * What one low-zoom tile does cost is the tail of the smallest units. Martin
 * generalizes below z9, and generalization drops features it cannot represent:
 * level 3 arrives as 1214 features at z0, 1634 at z2 and 1641 at z4, against the
 * 1642 rows docs/vector-tiles.md describes. So ANCHOR_TILE being as deep as it
 * can be is what keeps that tail to a single municipality, and that municipality
 * goes unlabelled — its boundary is still drawn, still hit-tested and still
 * selectable, because those read the tile for the zoom on screen rather than
 * this one.
 */
export async function fetchLabelAnchors(
  level: AdminLevel,
  init?: RequestInit,
): Promise<LabelAnchorCollection> {
  const response = await fetch(
    tileUrlAt(MARTIN_SOURCES.adminBoundaries, ANCHOR_TILE, { level }),
    init,
  )
  if (!response.ok) {
    throw new Error(`Label anchors for level ${level}: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const layer = new VectorTile(new Pbf(new Uint8Array(buffer))).layers[
    BOUNDARIES_SOURCE_LAYER
  ]
  if (!layer) return EMPTY_ANCHORS

  const features: LabelAnchorCollection['features'] = []

  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const polygons = toPolygons(feature.loadGeometry())
    if (polygons.length === 0) continue

    const largest = polygons.reduce((a, b) =>
      Math.abs(signedArea(b[0])) > Math.abs(signedArea(a[0])) ? b : a,
    )

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: toLngLat(pointOnSurface(largest), ANCHOR_TILE, layer.extent),
      },
      properties: {
        psgc: String(feature.properties.psgc),
        name: String(feature.properties.name),
        parent_psgc:
          feature.properties.parent_psgc == null
            ? null
            : String(feature.properties.parent_psgc),
        geo_level: String(feature.properties.geo_level),
      },
    })
  }

  return { type: 'FeatureCollection', features }
}
