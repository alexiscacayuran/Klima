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
 * Issued in parallel, but paced through one shared bucket (see `paced`). One
 * fan-out of eighteen sits inside the edge limit's burst of 20 at 10 r/s; two
 * at once — the station layer and the province labels both load with the
 * default layer — are 36, and fired together the overflow comes back 429. This
 * runs once per session rather than per pan (§1), so the pacing costs a few
 * seconds, once.
 *
 * A 429 that gets through anyway — the bucket is per IP, and other tabs and the
 * app's other requests draw on it too — is retried after a pause (see
 * `withRetry`) rather than taken as a fault. Only 429: every other status is
 * still an answer.
 */
export async function fetchAllRegions<T>(
  fn: (psgc: string, init?: RequestInit) => Promise<T[]>,
  init?: RequestInit,
): Promise<T[]> {
  const responses = await Promise.all(
    REGION_PSGC.map((psgc) =>
      withRetry(() => paced(() => fn(psgc, init))).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return []
        throw error
      }),
    ),
  )
  return responses.flat()
}

/**
 * The pace fan-out requests start at, across every fan-out: a token bucket
 * shaped like nginx's own, and kept inside it.
 *
 * Half its burst up front, then one request per 125ms — 8 r/s against the
 * edge's 10 — so the requests the app makes outside a fan-out (a pin's
 * forecast, the catalogue, the station list) always find room. Two fan-outs
 * take about four seconds between them.
 */
const BURST = 10
const INTERVAL_MS = 125

let tokens = BURST
let refilledAt = Date.now()
let queue: Promise<void> = Promise.resolve()

function refill() {
  const now = Date.now()
  tokens = Math.min(BURST, tokens + (now - refilledAt) / INTERVAL_MS)
  refilledAt = now
}

/** Runs `task` once the bucket has a token for it, in the order asked. */
function paced<T>(task: () => Promise<T>): Promise<T> {
  const turn = queue.then(async () => {
    refill()
    if (tokens < 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, (1 - tokens) * INTERVAL_MS),
      )
      refill()
    }
    tokens -= 1
  })
  queue = turn
  return turn.then(task)
}

/** Attempts per region before a 429 is let through as a fault. */
const MAX_ATTEMPTS = 4

/**
 * Long enough for nginx's 10 r/s bucket to refill most of its burst, doubled on
 * each further attempt.
 */
const RETRY_DELAY_MS = 1000

async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task()
    } catch (error) {
      const throttled = error instanceof ApiError && error.status === 429
      if (!throttled || attempt >= MAX_ATTEMPTS) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * 2 ** (attempt - 1)),
      )
    }
  }
}
