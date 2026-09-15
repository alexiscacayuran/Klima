import { useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import type { CisProductName } from '@/api/products'
import { fetchSeasonal } from '@/api/seasonal'

/**
 * When the issuance behind a product's rasters was published.
 *
 * The raster key needs the issuance date — `{year}` and `{YYYYMMDD}` in
 * `processed/raster/{year}/{prefix}.{YYYYMMDD}.{YYYYMM}.webp` — and that is the
 * one fact about an issuance the app does not otherwise hold.
 *
 * docs/raster-layers.md §4 says the key comes from "the `/seasonal` response the
 * app already fetches", and for the popup it does. But hooks/useSeasonalForecast
 * keys on the **pin** and returns `idle` with nothing pinned, while the surface
 * covers the whole country whether or not anything is pinned — so on first paint
 * there is no response to read the date out of. That is the gap this fills.
 *
 * Nor does the catalogue answer it. `/products` publishes `latestData`, which
 * for seasonal is the first **forecast month** (`2026-09-01` against a
 * `2026-08-26` issuance) — close enough to look right and wrong enough to 404.
 *
 * ## Why a province is named to answer a national question
 *
 * `issuedAt` belongs to the issuance, not to the place: every row of every
 * `/seasonal` response for one issuance carries the same value, verified across
 * Abra, NCR and Cavite against the CIS dev stack on 2026-09-14. But the endpoint
 * has no national form — `location` is required and omitting it is a `400` — so
 * one province is asked on behalf of the country.
 *
 * This is a workaround for an issuance endpoint CIS does not publish, and it is
 * worth replacing with one rather than growing: the right shape is a route that
 * names the issuance without naming a place. Until then the anchor is an
 * implementation detail of this file and nothing outside it knows a province was
 * involved.
 *
 * Cached at module scope and keyed by product, so it costs one request per
 * session no matter how many layers read it. A scrub, a playback and a variant
 * switch all reuse the same promise.
 */

/**
 * The province asked on the country's behalf.
 *
 * NCR: a promoted level-2 unit that every seasonal issuance has carried, and
 * which — being a region code sitting in the province tier — resolves to exactly
 * one row rather than expanding into its members the way a true region code
 * does (docs/cis-api.md §3).
 */
const ISSUANCE_ANCHOR_PSGC = '1300000000'

export type IssuanceState =
  /** Nothing to ask about: a product with no raster issuance to resolve. */
  | { status: 'idle' }
  | { status: 'loading' }
  /** ISO with an explicit +08:00, exactly as the API sends it. */
  | { status: 'ready'; issuedAt: string }
  /**
   * The product publishes nothing right now — a `404`, or an issuance covering
   * no row for the anchor. Not an error (docs/cis-api.md §6); the surface simply
   * does not draw.
   */
  | { status: 'none' }
  | { status: 'error'; error: Error }

/**
 * One in-flight or settled lookup per product.
 *
 * A promise rather than a value, so two layers mounting in the same tick share
 * one request instead of racing two. Never populated with a rejection: a failed
 * lookup is deleted below so a later mount can retry rather than inheriting an
 * outage from the first paint of the session.
 */
const cache = new Map<CisProductName, Promise<string | null>>()

function loadIssuance(product: CisProductName): Promise<string | null> {
  const cached = cache.get(product)
  if (cached) return cached

  // Deliberately not given the caller's AbortSignal. The result is shared, so
  // one consumer unmounting must not cancel the lookup the others are waiting
  // on; the hook below drops the answer instead of cancelling it.
  const pending = fetchSeasonal({ psgc: ISSUANCE_ANCHOR_PSGC })
    .then((provinces) => provinces[0]?.issuedAt ?? null)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null
      cache.delete(product)
      throw error
    })

  cache.set(product, pending)
  return pending
}

export function useIssuance(
  product: CisProductName | undefined,
): IssuanceState {
  const [state, setState] = useState<IssuanceState>({ status: 'idle' })

  useEffect(() => {
    // Only seasonal publishes an issuance this can resolve today. A product
    // reaching here with rasters of its own needs its own lookup, not this one
    // pointed at a province that knows nothing about it.
    if (product !== 'seasonal') {
      setState({ status: 'idle' })
      return
    }

    let live = true
    setState({ status: 'loading' })

    loadIssuance(product)
      .then((issuedAt) => {
        if (!live) return
        setState(issuedAt ? { status: 'ready', issuedAt } : { status: 'none' })
      })
      .catch((error: unknown) => {
        if (!live) return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => {
      live = false
    }
  }, [product])

  return state
}
