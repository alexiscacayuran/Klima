/**
 * The CIS JSON API contract.
 *
 * Express belongs to the CIS stack, not to this repo — Klima only reads it. See
 * docs/cis-api.md for the server side; everything here is the client half.
 *
 * The mirror image of config/martin.ts: every URL the app fetches from the API
 * is built by a function in this file, so repointing at staging or production
 * is one env var rather than a search for string concatenation.
 */

/**
 * Where the API is reachable *from the browser*.
 *
 * Unlike Martin, this must be **same-origin in every mode**. The API sends no
 * CORS headers at all — there is no CORS middleware in the Express app — so a
 * cross-origin fetch is blocked by the browser even though curl returns 200
 * (docs/cis-api.md §1). Both modes therefore go through a proxy that this
 * default assumes exists:
 *
 *   dev   -> vite.config.ts `server.proxy['/api']`
 *   build -> the `location /api/` block in nginx.conf.template
 *
 * Override with VITE_API_URL only to point at a deployment whose gateway
 * rewrites the prefix — `<host>/v1/cis` rather than `/api/v1`. Setting it to a
 * *cross-origin* URL will not work, whatever the value; that is the CORS
 * constraint above, not a limitation of this module.
 *
 * Not absolutized, deliberately — the reason TILES_BASE_URL is is MapLibre's
 * `style.sprite` validation, and nothing here passes through MapLibre.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? '/api/v1'
).replace(/\/$/, '')

/**
 * A bearer token, if the deployment puts one in the bundle.
 *
 * Every GET under `/api/v1` authenticates now — `/products` and `/seasonal/*`
 * included — and the token has to be entitled to the product being read
 * (docs/cis-api.md §2). This module has always sent the header on every request
 * rather than product by product, which is why that change cost nothing here.
 *
 * Usually unset, and the app still authenticates: a VITE_-prefixed value is
 * compiled into the bundle and served to anyone who loads the page, so both of
 * this repo's proxies inject the header out of band instead — `CIS_API_TOKEN`
 * in vite.config.ts for dev and in nginx.conf.template for a build. This stays
 * for a deployment that fronts the app with neither.
 */
const API_TOKEN = import.meta.env.VITE_API_TOKEN

/**
 * A failed request, carrying the status the caller has to branch on.
 *
 * `404` in particular is not a failure for this API: a location that resolves
 * but has no data is a 404 rather than an empty array, so a region-level
 * fan-out over a sparse product legitimately produces them (docs/cis-api.md
 * §6). Callers need the number to tell that from a real fault, which is what a
 * bare `Error` with a formatted message cannot give them.
 */
export class ApiError extends Error {
  // A plain field rather than a constructor parameter property: `tsconfig.app`
  // sets `erasableSyntaxOnly`, which rules out the shorthand because it emits
  // runtime code a type-stripping transform could not produce.
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Build an absolute-from-root API path with its query string. */
export function apiUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const url = `${API_BASE_URL}${path}`
  if (!params) return url
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  const search = query.toString()
  return search ? `${url}?${search}` : url
}

/**
 * One GET, with the auth header and the error shape applied.
 *
 * Errors are always `{ "message": "…" }`, so the body is worth reading before
 * throwing — "Product access forbidden" and "Invalid or expired token" are both
 * 403/401 and mean different things to whoever is debugging.
 */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(path, params), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: unknown) =>
        body && typeof body === 'object' && 'message' in body
          ? String(body.message)
          : response.statusText,
      )
      .catch(() => response.statusText)
    throw new ApiError(response.status, message)
  }

  return response.json() as Promise<T>
}
