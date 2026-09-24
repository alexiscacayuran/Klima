import { useEffect, useSyncExternalStore } from 'react'
import { ApiError } from '@/api/client'

/**
 * A fetch per key, shared by every consumer and kept for the page's life.
 *
 * The module-store pattern hooks/useStations uses, generalised to a key: one
 * request per key rather than one per mounted reader, so the popup and the
 * detail panel reading the same province cost one request between them, and
 * re-opening a station already seen costs none. The account has one rate-limit
 * bucket across every route (docs/cis-api.md §1), which is what makes that
 * worth a file.
 *
 * No AbortSignal, for the reason the national stores give: the result is shared,
 * so one reader moving on must not cancel a fetch another is waiting on. Order
 * is kept by the key instead — a reader only ever looks at its own key's entry,
 * so a slow reply for a place the user has left lands in the cache and is never
 * shown in place of the new one.
 */
export type ResourceState<T> =
  /** No key: nothing asked for. */
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  /**
   * The request resolved to nothing — a `404`, or the fetcher's own `null`.
   * Not an error (docs/cis-api.md §6): a unit CIS publishes nothing for.
   */
  | { status: 'none' }
  | { status: 'error'; error: Error }

const IDLE = { status: 'idle' } as const
const LOADING = { status: 'loading' } as const

export function createKeyedResource<K extends string | number, T>(
  fetcher: (key: K) => Promise<T | null>,
) {
  const entries = new Map<K, ResourceState<T>>()
  const listeners = new Set<() => void>()

  const publish = (key: K, state: ResourceState<T>) => {
    entries.set(key, state)
    for (const listener of listeners) listener()
  }

  const load = (key: K) => {
    const current = entries.get(key)
    // Loading and settled entries both stand. An error is the one retried, on
    // the next mount that asks — cleared rather than latched, as elsewhere.
    if (current && current.status !== 'error') return
    publish(key, LOADING)

    fetcher(key)
      .then((data) =>
        publish(key, data === null ? { status: 'none' } : { status: 'ready', data }),
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          publish(key, { status: 'none' })
          return
        }
        publish(key, {
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  /** The entry for `key`, fetching it on first ask. Null asks for nothing. */
  return function useKeyedResource(key: K | null): ResourceState<T> {
    const state = useSyncExternalStore(subscribe, () =>
      key === null ? IDLE : (entries.get(key) ?? LOADING),
    )

    useEffect(() => {
      if (key !== null) load(key)
    }, [key])

    return state
  }
}
