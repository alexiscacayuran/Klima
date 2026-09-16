import { useEffect, useSyncExternalStore } from 'react'
import { fetchAllRegions } from '@/api/normalize'
import { fetchSeasonalStations } from '@/api/seasonal'
import type { SeasonalStation } from '@/api/seasonal'

/** The issuance, keyed by the station id the geometry is keyed by. */
export type SeasonalStationIndex = ReadonlyMap<number, SeasonalStation>

export type SeasonalStationsState =
  | { status: 'loading' }
  | { status: 'ready'; stations: SeasonalStationIndex }
  | { status: 'error'; error: Error }

/**
 * Every station's seasonal forecast, nationally, fetched once.
 *
 * Three rules shape this, and they are the same three hooks/useSeasonalForecast
 * follows — with one inversion worth naming.
 *
 * - **The whole country at once, not the viewport.** The API has no bbox or
 *   viewport query and no national one either, so a national layer is a fan-out
 *   over the 18 regions (docs/cis-api.md §3, §7). Eighteen requests is cheap; a
 *   fan-out per pan would not be, which is why this is keyed on nothing at all
 *   and runs a single time per page.
 * - **The whole issuance, not the scrubbed month.** `date` only filters what is
 *   already one response, so omitting it makes the timeline — including its
 *   playback, which steps every month in a few seconds — cost no requests.
 * - **One request shape, many readers.** `/seasonal?spatialRes=station` answers
 *   for every station in a region at once, so the per-station endpoint is not
 *   what builds this. It is 18 requests rather than 73.
 *
 * The inversion: useSeasonalForecast keys on the *pin* and fetches one province,
 * because a province card is about one place the user chose. This is a layer
 * rather than a card — every station is on screen at once — so there is nothing
 * to key on and the only sensible unit is the whole issuance.
 *
 * Indexed by station id rather than returned as a list, because that is how it
 * is read: the geometry arrives from a different endpoint and the two are joined
 * per station when the collection is built.
 */
let snapshot: SeasonalStationsState = { status: 'loading' }
let inFlight = false
const listeners = new Set<() => void>()

function publish(next: SeasonalStationsState) {
  snapshot = next
  for (const listener of listeners) listener()
}

function load() {
  if (inFlight || snapshot.status === 'ready') return
  inFlight = true
  publish({ status: 'loading' })

  // No AbortSignal: the result is shared, so one consumer unmounting must not
  // cancel the fetch the others are waiting on.
  fetchAllRegions((psgc) => fetchSeasonalStations(psgc))
    .then((rows) => {
      // A station belongs to exactly one province and therefore to one region,
      // so the eighteen responses do not overlap and this cannot silently drop
      // a row. Built as a Map anyway rather than trusted as a list: the join it
      // feeds is per station, and a linear scan per marker on every render is
      // the shape this exists to avoid.
      const stations = new Map<number, SeasonalStation>()
      for (const row of rows) stations.set(row.stationId, row)

      inFlight = false
      publish({ status: 'ready', stations })
    })
    .catch((error: unknown) => {
      // Cleared rather than latched, so a later mount can retry. Note what does
      // *not* land here: a region with no published stations answers 404, which
      // fetchAllRegions folds into an empty contribution, because that is data
      // about the issuance rather than a failure (docs/cis-api.md §6).
      inFlight = false
      publish({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The seasonal issuance at every station.
 *
 * `enabled` gates the request rather than the read, so a layer that draws no
 * station points never spends the fan-out. It is a parameter instead of a
 * condition at the call site because the rule of hooks forbids the obvious
 * version, and because the gate belongs with the fetch it is protecting.
 */
export function useSeasonalStations(enabled: boolean): SeasonalStationsState {
  const state = useSyncExternalStore(subscribe, () => snapshot)

  useEffect(() => {
    if (enabled) load()
  }, [enabled])

  return state
}
