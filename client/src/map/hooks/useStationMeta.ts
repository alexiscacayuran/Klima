import { fetchStationMeta } from '@/api/stations'
import type { StationMeta } from '@/api/stations'
import { createKeyedResource } from './keyedResource'

/**
 * A station's metadata — elevation, type, normals period — for the station the
 * user opened.
 *
 * Per station and on demand, because `/stations/:id` has no bulk form
 * (docs/cis-api.md §7): fetching it for the layer would be one request per
 * station on screen. One per station *opened* is cheap, and cached for the
 * page, so going back to a station already read costs nothing.
 */
export const useStationMeta = createKeyedResource<number, StationMeta>(
  (stationId) => fetchStationMeta(stationId),
)
