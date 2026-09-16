import { useCallback, useState } from 'react'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { SOURCE_IDS } from '@/map/config/constants'
import { useMapEvent } from './useMapEvent'
import { useRawMap } from './useMapInstance'

/**
 * What MapLibre's clustering has decided to show, read back as plain data.
 *
 * The clustering itself is the source's — `cluster: true` on a GeoJSON source,
 * which runs supercluster in a worker and serves the result as tiles. That is
 * the part worth not reimplementing. What it does not do is *render*: the pills
 * are DOM elements, because they are small typeset cards rather than icons, and
 * a symbol layer cannot set them in the same type as the rest of the chrome.
 *
 * So this is the seam. Ask the source what it has clustered at this camera,
 * hand back a list, and let React draw markers from it.
 */

/** A group of stations too close together to draw separately at this zoom. */
export type StationCluster = {
  kind: 'cluster'
  /** Supercluster's own id, and the key for both dedupe and expansion. */
  clusterId: number
  count: number
  lng: number
  lat: number
}

/** A single station, drawn at its own position. */
export type StationPoint = {
  kind: 'station'
  id: number
  lng: number
  lat: number
  /**
   * The feature's own properties, as the collection baked them in.
   *
   * Carried through rather than re-joined at the marker: these have already made
   * a round trip through the clustering worker, so the tile's copy is what is in
   * hand here and looking the station up again would be work to arrive back at
   * the same strings. Typed loosely because it is MapLibre's property bag —
   * overlays/StationMarkers owns the shape and reads it.
   */
  properties: Record<string, unknown>
}

export type StationItem = StationCluster | StationPoint

/**
 * A feature as `querySourceFeatures` actually returns it.
 *
 * MapLibre types the result as a plain GeoJSON feature and then attaches the
 * tile it was read from — `{ z, x, y }` directly, *not* the `canonical` shape
 * an OverscaledTileID has elsewhere in the library. Declared here because the
 * public types do not admit the field at all, and because reaching for
 * `tile.canonical.z` compiles perfectly, reads as correct, and is `undefined`
 * at runtime.
 */
type QueriedFeature = MapGeoJSONFeature & {
  tile?: { z: number; x: number; y: number }
}

/**
 * Which tile zoom is the live one, of those the query returned.
 *
 * During a zoom MapLibre keeps the old tiles on screen until the new ones are
 * parsed, so a query mid-transition sees both — and for a clustered source that
 * means the same stations twice, grouped differently, under ids that share
 * nothing. Only one of those is what the camera is showing.
 *
 * Chosen as the zoom nearest the camera rather than computed from it. The tile
 * zoom for a 512px source is the camera's *rounded* zoom, not its floor, so a
 * derived comparison is a detail of MapLibre's tile arithmetic that is easy to
 * get subtly wrong and impossible to notice: the wrong answer is not a bad pill
 * but no pills at all. Reading it off the tiles themselves cannot drift.
 *
 * Ties break to the finer tier, which is the one a transition is arriving at.
 */
function liveTileZoom(
  features: QueriedFeature[],
  cameraZoom: number,
): number | null {
  let best: number | null = null
  let bestDistance = Infinity

  for (const feature of features) {
    const z = feature.tile?.z
    if (z === undefined) continue
    const distance = Math.abs(z - cameraZoom)
    if (distance < bestDistance || (distance === bestDistance && z > best!)) {
      best = z
      bestDistance = distance
    }
  }

  return best
}

/**
 * The clusters and loose stations currently on screen.
 *
 * Four things about `querySourceFeatures` shape this, all of them verified
 * against maplibre-gl 5 rather than assumed:
 *
 * - **It reads loaded tiles, and dedupes only by tile.** Cluster tiles are
 *   generated with a buffer around their edges, so a point near a seam is in
 *   both neighbouring tiles and comes back twice. Nothing upstream removes
 *   that; this does, by id.
 * - **Loose points carry only their own properties.** A singleton has no
 *   `cluster` or `cluster_id` field at all — those exist only on aggregates —
 *   so the branch is on `cluster === true` and the dedupe key for a station has
 *   to come from the feature's own id, which is why the collection sets one.
 * - **Tiles retained across a zoom transition are queried too**, so mid-zoom the
 *   same stations can be present as clusters from two different zoom levels with
 *   different ids. Dedupe cannot merge those, so results are filtered to one
 *   tile zoom — see liveTileZoom, and the note there on why it is read off the
 *   tiles rather than derived from the camera.
 * - **`map.isSourceLoaded()` is not a readiness signal here.** It returns true
 *   for a source that is loaded *because it is unused* and holds no tiles at
 *   all, which is precisely the failure this layer is exposed to. A non-empty
 *   result is the only honest signal, so there is nothing to wait on — the hook
 *   just re-reads whenever the map says something changed.
 */
export function useStationClusters(enabled: boolean): StationItem[] {
  const map = useRawMap()
  const [items, setItems] = useState<StationItem[]>([])

  const read = useCallback(() => {
    if (!map || !enabled) {
      setItems((current) => (current.length === 0 ? current : []))
      return
    }
    if (!map.getSource(SOURCE_IDS.stations)) return

    const features = map.querySourceFeatures(
      SOURCE_IDS.stations,
    ) as QueriedFeature[]

    const liveZoom = liveTileZoom(features, map.getZoom())

    const next: StationItem[] = []
    const seen = new Set<string>()

    for (const feature of features) {
      // Clusters from a tile the camera has moved away from. Dedupe cannot
      // catch these: the same stations grouped at two zooms are two different
      // clusters with two different ids, both legitimately present while the
      // old tiles are still retained.
      if (liveZoom !== null && feature.tile?.z !== liveZoom) continue

      if (feature.geometry.type !== 'Point') continue
      const [lng, lat] = feature.geometry.coordinates as [number, number]
      const properties = feature.properties ?? {}

      if (properties.cluster === true) {
        const clusterId = Number(properties.cluster_id)
        const key = `c${clusterId}`
        if (seen.has(key)) continue
        seen.add(key)
        next.push({
          kind: 'cluster',
          clusterId,
          // `point_count_abbreviated` is a number below 1000 and a string above
          // it; the raw count is always a number, and is what a pill shows.
          count: Number(properties.point_count),
          lng,
          lat,
        })
        continue
      }

      const id = Number(feature.id)
      if (!Number.isFinite(id)) continue
      const key = `s${id}`
      if (seen.has(key)) continue
      seen.add(key)
      next.push({ kind: 'station', id, lng, lat, properties })
    }

    setItems(next)
  }, [map, enabled])

  // Not `moveend` alone. Tiles are requested inside the render loop, so at
  // `moveend` the tiles for the new camera do not exist yet and the query would
  // return the previous frame's clusters. `sourcedata` fires as each one lands.
  useMapEvent('moveend', read)
  useMapEvent('sourcedata', (event) => {
    if (event.sourceId === SOURCE_IDS.stations) read()
  })
  // The settled signal, which also covers the first paint: a source added after
  // the map has gone quiet produces no move and no further sourcedata once its
  // tiles are in.
  useMapEvent('idle', read)

  return items
}
