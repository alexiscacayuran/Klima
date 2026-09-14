import { apiGet } from './client'

/**
 * The product catalogue — `GET /products`.
 *
 * The only place CIS publishes the two freshness fields, and the reason this is
 * the first endpoint the app calls: between them they say what data exists
 * without probing a data endpoint (docs/cis-api.md §5).
 */

/**
 * The four products CIS publishes, by the name the API knows them under.
 *
 * These are also the strings the auth middleware scopes a token on, so they are
 * not display labels and must not be prettified — the rail's own labels live in
 * map/config/products.ts and are a separate vocabulary.
 */
export const CIS_PRODUCT_NAMES = [
  'drought',
  'fiveday',
  'seasonal',
  'daily-monitoring',
] as const

export type CisProductName = (typeof CIS_PRODUCT_NAMES)[number]

export type CisProduct = {
  id: number
  name: string
  /** `CLIMPS` | `PRSD` — which PAGASA section issues it. */
  origin: string
  description: string
  /** When CIS *expects* the next issuance. A schedule, so it drifts. */
  nextUpdateAt: string | null
  /**
   * The initial date of the product's latest issuance, as `YYYY-MM-DD` — not
   * an ISO timestamp like every other date field here, and null for a product
   * with no data loaded.
   *
   * What that date *means* follows each product's own granularity: the
   * assessment month for drought, the first forecast month for seasonal, the
   * earliest day of the block for five-day, the observed day for daily
   * monitoring. Slice it to the granularity the endpoint speaks —
   * `slice(0, 7)` for the monthly products, whose own responses and `date`
   * params identify months as `YYYY-MM`.
   *
   * Derived per request from the newest `issuedAt`, so it cannot drift out of
   * sync with the data, and it is what every endpoint resolves an omitted
   * `date` to. That makes it both the value a date picker opens on and the
   * bound it clamps to.
   */
  latestData: string | null
  createdAt: string
  updatedAt: string
}

/**
 * The catalogue, keyed by product name.
 *
 * The wire format is an array in no particular order, and every caller wants
 * one named product out of it, so the lookup is built once here rather than at
 * each call site. Unknown names are kept: a product added server-side after
 * this shipped should not vanish from a debugging session.
 */
export type ProductCatalogue = Record<string, CisProduct>

export async function fetchProducts(
  init?: RequestInit,
): Promise<ProductCatalogue> {
  const products = await apiGet<CisProduct[]>('/products', undefined, init)
  return Object.fromEntries(products.map((product) => [product.name, product]))
}
