import { useEffect, useSyncExternalStore } from 'react'
import { fetchAllRegions } from '@/api/normalize'
import { fetchSeasonal } from '@/api/seasonal'
import type { SeasonalProvince } from '@/api/seasonal'

/** The issuance, keyed by the PSGC the boundary tiles carry. */
export type SeasonalProvinceIndex = ReadonlyMap<string, SeasonalProvince>

export type SeasonalProvincesState =
  | { status: 'loading' }
  | { status: 'ready'; provinces: SeasonalProvinceIndex }
  | { status: 'error'; error: Error }

/**
 * Every province's seasonal forecast, nationally, fetched once.
 *
 * The province twin of hooks/useSeasonalStations, and shaped by the same three
 * rules: the whole country as an 18-region fan-out rather than the viewport,
 * the whole issuance rather than the scrubbed month, and one run per page. A
 * region PSGC resolves to every province in it (see api/seasonal
 * `fetchSeasonal`), so eighteen requests cover all of them.
 *
 * What reads it is the label layer, which prints each unit's value under its
 * name. useSeasonalForecast still answers for the pin on its own — it is keyed
 * to one place and costs one request, and making the popup wait on a national
 * fan-out to quote a single province would be a regression for the card.
 */
let snapshot: SeasonalProvincesState = { status: 'loading' }
let inFlight = false
const listeners = new Set<() => void>()

function publish(next: SeasonalProvincesState) {
  snapshot = next
  for (const listener of listeners) listener()
}

function load() {
  if (inFlight || snapshot.status === 'ready') return
  inFlight = true
  publish({ status: 'loading' })

  // No AbortSignal: the result is shared, so one consumer unmounting must not
  // cancel the fetch the others are waiting on.
  fetchAllRegions((psgc) => fetchSeasonal({ psgc }))
    .then((rows) => {
      const provinces = new Map<string, SeasonalProvince>()
      for (const row of rows) provinces.set(row.psgc, row)

      inFlight = false
      publish({ status: 'ready', provinces })
    })
    .catch((error: unknown) => {
      // Cleared rather than latched, so a later mount can retry.
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
 * The seasonal issuance for every province.
 *
 * `enabled` gates the request rather than the read, so a layer with no province
 * reading never spends the fan-out.
 */
export function useSeasonalProvinces(enabled: boolean): SeasonalProvincesState {
  const state = useSyncExternalStore(subscribe, () => snapshot)

  useEffect(() => {
    if (enabled) load()
  }, [enabled])

  return state
}
