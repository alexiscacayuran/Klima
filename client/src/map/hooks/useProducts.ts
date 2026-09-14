import { useEffect, useState } from 'react'
import { fetchProducts } from '@/api/products'
import type { ProductCatalogue } from '@/api/products'

export type ProductsState =
  | { status: 'loading' }
  | { status: 'ready'; catalogue: ProductCatalogue }
  | { status: 'error'; error: Error }

/**
 * Fetches the CIS product catalogue once on mount.
 *
 * The counterpart to useMartinCatalog, and for the same reason: the API is a
 * separate stack that can be down while this app is perfectly healthy, so an
 * explicit error state is how the UI says which of the two is at fault instead
 * of rendering a scrubber with no dates on it and no explanation.
 *
 * One fetch for the whole page. The catalogue is small, every product is in it,
 * and `latestData` only moves when CIS imports an issuance — so there is
 * nothing to refetch on a product change. If a second consumer appears this
 * should be lifted into a provider rather than called twice; and if the app
 * ever needs to notice an issuance landing mid-session, this is the poll,
 * because the API has no push channel for data (docs/cis-api.md §7).
 */
export function useProducts(): ProductsState {
  const [state, setState] = useState<ProductsState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetchProducts({ signal: controller.signal })
      .then((catalogue) => setState({ status: 'ready', catalogue }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => controller.abort()
  }, [])

  return state
}
