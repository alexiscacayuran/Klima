import { VectorTile } from '@mapbox/vector-tile'
import type { VectorTileLayer } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import {
  BOUNDARIES_SOURCE_LAYER,
  MARTIN_SOURCES,
  tileUrlAt,
} from '@/map/config/martin'
import { PHILIPPINES_BOUNDS } from '@/map/config/viewState'
import type { AdminLevel } from '@/map/types/features'

/**
 * The one boundary tile that holds the whole country.
 *
 * Two things read the administrative geometry outside of MapLibre: the label
 * anchors (utils/labelAnchors), which need one point per unit, and the timeline
 * snapshots (utils/snapshotGeometry), which need a thumbnail-sized silhouette.
 * Both want the whole country in a single request and neither wants a second
 * Martin source to exist for it, so both read this tile — the same
 * `admin_boundaries` source the map draws, asked for at the one zoom where the
 * country fits inside one tile.
 */

export const lngToTileX = (lng: number, z: number) =>
  ((lng + 180) / 360) * 2 ** z

export const latToTileY = (lat: number, z: number) => {
  const sin = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** z
}

export type TileAddress = { z: number; x: number; y: number }

/**
 * The deepest single tile that still holds the whole country.
 *
 * One tile is the requirement, not an optimisation: a unit split across two
 * tiles arrives as two features with two largest-parts and would be labelled
 * twice, which is half of the bug labelAnchors exists to remove. Deepest,
 * because a tile's 4096 coordinate units are spread over its own span — the
 * smaller the tile, the finer the geometry it can express.
 *
 * For PHILIPPINES_BOUNDS this resolves to z4/13/7: about 600m per unit, against
 * a label that only has to land inside a province.
 */
export function coveringTile(
  bounds: readonly [number, number][],
  maxZoom: number,
): TileAddress {
  const [[west, south], [east, north]] = bounds
  let deepest: TileAddress = { z: 0, x: 0, y: 0 }

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
const MAX_NATIONAL_ZOOM = 6

export const NATIONAL_TILE = coveringTile(
  PHILIPPINES_BOUNDS as readonly [number, number][],
  MAX_NATIONAL_ZOOM,
)

/**
 * The boundaries layer of a whole-country tile at `level`, or null when the
 * tile carries no such layer — which is how the server answers for a level it
 * does not publish at this zoom.
 *
 * NATIONAL_TILE unless told otherwise. A reader that needs less detail than a
 * label does can ask for a shallower tile that still holds the country — see
 * SNAPSHOT_TILE in utils/snapshotGeometry — and Martin's own generalisation
 * does the thinning for it.
 */
export async function fetchNationalLayer(
  level: AdminLevel,
  init?: RequestInit,
  tile: TileAddress = NATIONAL_TILE,
): Promise<VectorTileLayer | null> {
  const response = await fetch(
    tileUrlAt(MARTIN_SOURCES.adminBoundaries, tile, { level }),
    init,
  )
  if (!response.ok) {
    throw new Error(`National tile for level ${level}: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  return (
    new VectorTile(new Pbf(new Uint8Array(buffer))).layers[
      BOUNDARIES_SOURCE_LAYER
    ] ?? null
  )
}
