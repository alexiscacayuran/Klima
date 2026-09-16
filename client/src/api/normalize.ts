import { ApiError } from './client'
import { REGION_PSGC } from './constants'

/**
 * The shapes the API answers in, reconciled once.
 *
 * docs/cis-api.md §8 asks for exactly this file, and names the two things that
 * belong in it rather than at a call site. One of them — extracting the PSGC
 * from whichever field a product spells it in — is already handled where it
 * arises, by each endpoint module renaming at its own fetch boundary. This is
 * the other.
 */

/**
 * The whole country, by asking for each region and flattening.
 *
 * `location=Philippines` is a 404 and there is no bbox or viewport parameter, so
 * this is the only way to read a product nationally (docs/cis-api.md §3). One
 * place, one retry policy, one decision about what a failure means — rather than
 * eighteen `fetch`es at every call site that wants a national layer.
 *
 * **A 404 is data, not a fault.** A location that resolves but has no rows
 * answers 404 rather than with an empty array (§6), so a fan-out over a sparse
 * product legitimately produces them: a region where no station reports, a month
 * the issuance does not cover. Those regions contribute nothing and the rest of
 * the country still paints. Any other status is a real fault and is allowed to
 * reject — a 401 means the whole session is unauthenticated and silently
 * returning seventeen-eighteenths of a map would hide that.
 *
 * Issued in parallel deliberately. Eighteen requests sits far inside the edge
 * limit's burst of 20 at 10 r/s, and this runs once per session rather than per
 * pan (§1).
 */
export async function fetchAllRegions<T>(
  fn: (psgc: string, init?: RequestInit) => Promise<T[]>,
  init?: RequestInit,
): Promise<T[]> {
  const responses = await Promise.all(
    REGION_PSGC.map((psgc) =>
      fn(psgc, init).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return []
        throw error
      }),
    ),
  )
  return responses.flat()
}
