import { useEffect, useSyncExternalStore } from 'react'
import { fetchStations } from '@/api/stations'
import type { Station, StationProduct } from '@/api/stations'

export type StationsState =
  | { status: 'loading' }
  | { status: 'ready'; stations: Station[] }
  | { status: 'error'; error: Error }

/**
 * Where the stations are, shared by every consumer.
 *
 * The same module store hooks/useProducts uses, for the same reasons: one
 * request per page rather than one per mount, nothing has to be mounted above
 * anything else, and a retry after a failure resolves for everyone at once
 * rather than leaving two consumers disagreeing on screen.
 *
 * Keyed by product, because `/stations` filters on it and the answers differ —
 * 73 stations publish a seasonal forecast where 108 exist. A map holding one
 * entry today, and the shape that stops daily monitoring needing its own copy
 * of this file.
 *
 * **No localStorage.** Earlier plans for this layer cached the assembled
 * GeoJSON, because building it meant one request per station and a cold load
 * could not fit inside a rate-limit window at all. `/stations` now returns
 * `lat`/`long` directly (docs/cis-api.md §5), so this is a single cheap
 * request — and a persistent cache would buy nothing in exchange for a
 * staleness bug the day PAGASA commissions a station.
 */
type Store = {
  snapshot: StationsState
  inFlight: boolean
  listeners: Set<() => void>
}

const stores = new Map<StationProduct, Store>()

function storeFor(product: StationProduct): Store {
  let store = stores.get(product)
  if (!store) {
    store = { snapshot: { status: 'loading' }, inFlight: false, listeners: new Set() }
    stores.set(product, store)
  }
  return store
}

function publish(store: Store, next: StationsState) {
  store.snapshot = next
  for (const listener of store.listeners) listener()
}

function load(product: StationProduct) {
  const store = storeFor(product)
  if (store.inFlight || store.snapshot.status === 'ready') return
  store.inFlight = true
  publish(store, { status: 'loading' })

  // No AbortSignal, deliberately: the result is shared, so one consumer
  // unmounting must not cancel the fetch the others are waiting on.
  fetchStations(product)
    .then((stations) => {
      store.inFlight = false
      publish(store, { status: 'ready', stations })
    })
    .catch((error: unknown) => {
      // Cleared rather than latched, so a later mount retries.
      store.inFlight = false
      publish(store, {
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    })
}

/**
 * The stations that publish a product, with their positions.
 *
 * Geometry only — where the points are and what they are called. What each one
 * *forecasts* is a different request at a different cadence (see
 * useSeasonalStations), and the two are kept apart because they expire
 * differently: a station's coordinates are effectively permanent, while its
 * forecast is replaced every issuance.
 */
export function useStations(product: StationProduct): StationsState {
  const store = storeFor(product)

  const state = useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    () => store.snapshot,
  )

  useEffect(() => {
    load(product)
  }, [product])

  return state
}
