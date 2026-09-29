import { useMemo } from 'react'
import { describePlace, fetchLocations } from '@/api/locations'
import type { PlaceProfile, PsgcLocation } from '@/api/locations'
import { createKeyedResource } from './keyedResource'
import type { ResourceState } from './keyedResource'

type LocationList = {
  rows: PsgcLocation[]
  byPsgc: ReadonlyMap<string, PsgcLocation>
}

/**
 * The whole PSGC list, under the one key it has.
 *
 * A keyed resource with a single key rather than a store of its own, because
 * that is exactly its behaviour: fetched on first ask, shared by every reader,
 * retried after an error, and a `404` settled as `none` — which is what a CIS
 * deployment older than `/locations` answers (docs/cis-api.md §5).
 */
const useLocationList = createKeyedResource<'all', LocationList>(() =>
  fetchLocations().then((rows) => ({
    rows,
    byPsgc: new Map(rows.map((row) => [row.psgc, row])),
  })),
)

const IDLE = { status: 'idle' } as const
const NONE = { status: 'none' } as const

/**
 * What the PSGC list says about a place: its level, the units above and inside
 * it, its codes.
 *
 * One request for the session, made the first time a place is described rather
 * than at load — the list is the app's largest reference response, and a
 * session that never opens the detail panel has no use for it. Every place
 * after the first is read out of the same response.
 *
 * `none` when the list has no row for the code, as well as when the deployment
 * has no list: either way there is nothing to say about the place, and neither
 * is a fault.
 */
export function usePlaceProfile(
  psgc: string | null,
): ResourceState<PlaceProfile> {
  const list = useLocationList(psgc === null ? null : 'all')

  return useMemo(() => {
    if (psgc === null) return IDLE
    if (list.status !== 'ready') return list
    const profile = describePlace(list.data.rows, list.data.byPsgc, psgc)
    return profile ? { status: 'ready', data: profile } : NONE
  }, [list, psgc])
}
