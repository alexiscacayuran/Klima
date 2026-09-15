import { useEffect, useSyncExternalStore } from 'react'
import { fetchProducts } from '@/api/products'
import type { ProductCatalogue } from '@/api/products'

export type ProductsState =
  | { status: 'loading' }
  | { status: 'ready'; catalogue: ProductCatalogue }
  | { status: 'error'; error: Error }

/**
 * One catalogue, shared by every consumer, in one state.
 *
 * This file used to say that a second consumer should lift it into a provider.
 * The second consumer has arrived — the timeline names the dates, and
 * layers/RasterOverlay needs the same window to know which image to pull in
 * next — and this is that lift, as a module store rather than a context: one
 * request per page either way, but nothing has to be mounted above anything
 * else for it to hold, so a hook called from inside <Map> and one called from
 * the chrome outside it are reading the same thing.
 *
 * **Shared state, not just a shared request.** A shared *promise* would be
 * enough to fetch once, and is not enough to be correct: evict a failed one so
 * the next mount can retry, and two consumers mounting either side of that
 * eviction get different answers — which is a timeline reading "Dates
 * unavailable" over a map that has already drawn the surface for those dates.
 * Keeping the state here and broadcasting it means a retry resolves for
 * everyone, and the two can never contradict each other on screen.
 */
let snapshot: ProductsState = { status: 'loading' }
let inFlight = false
const listeners = new Set<() => void>()

function publish(next: ProductsState) {
  snapshot = next
  for (const listener of listeners) listener()
}

function load() {
  if (inFlight || snapshot.status === 'ready') return
  inFlight = true
  publish({ status: 'loading' })

  // Deliberately given no AbortSignal. The result is shared, so one consumer
  // unmounting must not cancel the fetch the others are waiting on.
  fetchProducts()
    .then((catalogue) => {
      inFlight = false
      publish({ status: 'ready', catalogue })
    })
    .catch((error: unknown) => {
      // Cleared rather than latched, so a later mount can try again — a 502
      // from the proxy in front of the API is not a permanent verdict on the
      // catalogue. Whatever that attempt returns is published to everyone.
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
 * The CIS product catalogue.
 *
 * The counterpart to useMartinCatalog, and for the same reason: the API is a
 * separate stack that can be down while this app is perfectly healthy, so an
 * explicit error state is how the UI says which of the two is at fault instead
 * of rendering a scrubber with no dates on it and no explanation.
 *
 * One fetch for the whole page. The catalogue is small, every product is in it,
 * and `latestData` only moves when CIS imports an issuance — so there is
 * nothing to refetch on a product change. If the app ever needs to notice an
 * issuance landing mid-session, this is the poll, because the API has no push
 * channel for data (docs/cis-api.md §7).
 */
export function useProducts(): ProductsState {
  const state = useSyncExternalStore(subscribe, () => snapshot)

  // Mounting into an error state retries; mounting into a good one is free.
  useEffect(() => {
    load()
  }, [])

  return state
}
