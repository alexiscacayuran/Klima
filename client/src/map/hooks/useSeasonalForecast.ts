import { fetchSeasonal } from '@/api/seasonal'
import type { SeasonalProvince } from '@/api/seasonal'
import { cisProductForVariable } from '@/map/config/products'
import { useSelection } from '@/map/state/useSelection'
import { createKeyedResource } from './keyedResource'

/**
 * The seasonal issuance for the pinned place.
 *
 * Two rules shape this hook, both from docs/cis-api.md §1:
 *
 * - It keys on the **pin**, never on the hover. The hover changes on every
 *   mousemove and the account has one rate-limit bucket across every route, so
 *   a fetch per hover would spend a session's whole budget crossing the map.
 * - It fetches the **whole issuance**, not the scrubbed month. `date` only
 *   filters what is already one response, so omitting it makes scrubbing — and
 *   the timeline's playback, which steps every month in a few seconds — cost
 *   nothing at all.
 *
 * Which leaves one request per province the user pins, and none for anything
 * else they do to it. Shared per province (see keyedResource), so the popup
 * and the detail panel quoting the same place are one request between them,
 * and pinning back to a province already seen is none.
 */
export type SeasonalForecastState =
  /** Nothing to fetch: no pin, or a selected layer with no seasonal data behind it. */
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; province: SeasonalProvince }
  /**
   * The place resolved and CIS publishes nothing for it — a `404`, or the empty
   * array the endpoint answers with when the issuance covers no row for it.
   * Not an error (docs/cis-api.md §6): §4 lists the units this legitimately
   * happens for, and the map lets you pin every one of them.
   */
  | { status: 'none' }
  | { status: 'error'; error: Error }

const useProvinceForecast = createKeyedResource((psgc: string) =>
  fetchSeasonal({ psgc }).then(
    // Matched by code rather than taken as `[0]`, because the endpoint answers
    // about a *location* and only the caller knows the location was a single
    // unit: a province PSGC resolves to itself and NCR — a region code sitting
    // in the level-2 tier — resolves to itself too, so the row for this code is
    // the one row that is about the place that was clicked. Anything else in the
    // array would be a neighbour, and naming a neighbour's rainfall under this
    // province's name is the one failure worth ruling out here.
    (provinces) => provinces.find((row) => row.psgc === psgc) ?? null,
  ),
)

export function useSeasonalForecast(): SeasonalForecastState {
  const { variable, pinned } = useSelection()

  /**
   * The whole dependency, deliberately reduced to one string.
   *
   * `pinned` is a fresh object per click and carries the click's own
   * coordinate, so a second click inside the same province is a new object with
   * the same place in it. Keying on the code means that costs no request: the
   * marker moves, the forecast does not change, because it is the province's.
   */
  const psgc =
    cisProductForVariable(variable) === 'seasonal' ? (pinned?.psgc ?? null) : null

  const state = useProvinceForecast(psgc)
  return state.status === 'ready'
    ? { status: 'ready', province: state.data }
    : state
}
