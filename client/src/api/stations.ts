import { apiGet } from './client'

/**
 * The station directory — `GET /stations`.
 *
 * The reference half of the contract, not a product: `/stations` authenticates
 * the caller and stops there, with no entitlement check, because station
 * identity is needed to interpret *any* product (docs/cis-api.md §2). A token
 * scoped to one dataset still reads all of them.
 */

/**
 * One station, as the map needs it.
 *
 * Three fields renamed away from the wire — `stationId`, `station` and `long` —
 * for the reason §3 gives and api/seasonal.ts already follows: the PSGC-or-id
 * field is spelled differently per endpoint, and nothing downstream should have
 * to remember whose spelling it is holding. `long` in particular is the one
 * MapLibre will silently not understand.
 */
export type Station = {
  /**
   * The station's own id — a **number**, not a PSGC.
   *
   * Station ids are `smallint` and arrive as numbers while every location id is
   * a string (docs/cis-api.md §6). The two are never comparable, which is why
   * this is typed as a number rather than normalised to a string for
   * convenience: the type is what stops a `===` against a `psgc`.
   */
  id: number
  name: string
  lng: number
  lat: number
}

/** The wire shape, before the renaming above. */
type StationRow = {
  stationId: number
  station: string
  lat: number | null
  long: number | null
  stationMeta: string
}

/**
 * The products a station can be filtered to.
 *
 * Camel-cased, and not the same vocabulary as `CisProductName`: the auth
 * middleware scopes on `daily-monitoring` while this parameter spells the same
 * dataset `dailyMonitoring`, and anything else is a 400 (docs/cis-api.md §5).
 * Two spellings of one idea, so both are declared rather than derived.
 */
export type StationProduct = 'seasonal' | 'dailyMonitoring'

/**
 * Every station that publishes a product, positions included — **one request**.
 *
 * This used to cost 1 + N: `/stations` published identity only and each
 * coordinate had to be fetched by id, which is why the docs once prescribed a
 * `localStorage` cache as the only workable approach. The endpoint now carries
 * `lat`/`long`, so the whole point layer is a single response and no cache is
 * warranted — see docs/cis-api.md §5.
 *
 * `stationMeta` is dropped rather than kept. It is a relative path whose prefix
 * is set by the *CIS server's* `NODE_ENV`, so it resolves only if this
 * deployment happens to mount the API at the same prefix; the doc's own advice
 * is to build the URL from the id and our base instead, and treat the field as
 * decoration.
 *
 * A station with no coordinate is dropped, not faulted. Nulls are pervasive and
 * expected (§6), and one unplaceable station is not a reason to lose the other
 * seventy-two — it is a station that cannot be drawn, which is a different thing
 * from a request that failed.
 */
export async function fetchStations(
  product?: StationProduct,
  init?: RequestInit,
): Promise<Station[]> {
  const rows = await apiGet<StationRow[]>('/stations', { product }, init)

  const stations: Station[] = []
  for (const row of rows) {
    if (typeof row.lat !== 'number' || typeof row.long !== 'number') continue
    stations.push({
      id: row.stationId,
      name: row.station,
      lng: row.long,
      lat: row.lat,
    })
  }
  return stations
}

/**
 * The station's own name, without the places that locate it.
 *
 * Names arrive as `"Ambulong, Tanauan, Batangas"` — the station, then the
 * municipality, then the province. A marker pill is a few characters wide and
 * sits *on* the place it is describing, so the leading segment is the only part
 * that adds anything; the rest is already under the pointer. The full string
 * stays available for a tooltip, which is why this returns a slice rather than
 * replacing the name at the fetch boundary.
 */
export const stationShortName = (name: string): string =>
  name.split(',')[0].trim() || name

/**
 * What `/stations` leaves out — `GET /stations/:id`.
 *
 * One station per request, and there is no bulk form (docs/cis-api.md §7), so
 * this is fetched for the station a user opens rather than for the layer. The
 * fields are the ones the detail panel prints; the rest of the response is
 * dropped here rather than carried as dead weight.
 *
 * `name` is the short form ("NAIA, Pasay City") and `longName` the upper-cased
 * one; the panel titles with `/stations`' own `station` string, which is what
 * the pill's tooltip already showed, so neither is kept.
 */
export type StationMeta = {
  id: number
  /** `synop`, `agromet`, `arg` or `radar` — free text on the wire, kept as-is. */
  type: string | null
  /** The PSGC of the unit the station stands in. Joins to boundary tiles. */
  locationId: string | null
  /** Metres above sea level. */
  elevation: number | null
  latDms: string | null
  longDms: string | null
  /** e.g. `"1949 - present"`. */
  yearRecord: string | null
  /** The normals the forecast's `normal*` fields are read against, e.g. `"1991-2020"`. */
  norPeriod: string | null
}

type StationMetaRow = StationMeta & Record<string, unknown>

export async function fetchStationMeta(
  stationId: number,
  init?: RequestInit,
): Promise<StationMeta> {
  const row = await apiGet<StationMetaRow>(`/stations/${stationId}`, undefined, init)
  return {
    id: row.id,
    type: row.type ?? null,
    locationId: row.locationId ?? null,
    elevation: typeof row.elevation === 'number' ? row.elevation : null,
    latDms: row.latDms ?? null,
    longDms: row.longDms ?? null,
    yearRecord: row.yearRecord ?? null,
    norPeriod: row.norPeriod ?? null,
  }
}
