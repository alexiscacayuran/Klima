import { apiGet } from './client'

/**
 * The seasonal forecast — `GET /seasonal`.
 *
 * One issuance, six months ahead, published at two resolutions: per province,
 * and per station (docs/cis-api.md §5). Both are below — the province shape
 * first, then the richer station one, which carries temperature and tercile
 * probabilities the province rows have no room for.
 */

/**
 * One forecast month for one province, as it arrives.
 *
 * All four rainfall fields are in the response whether or not anything reads
 * them; the map reads exactly one per selected layer, and which one is declared
 * in map/config/seasonalReadings.ts rather than decided at a call site.
 *
 * Every value is nullable, and a null is not an error (docs/cis-api.md §6): a
 * month CIS holds no aggregate for is a null field on a row that exists, which
 * is a different fact from a month the issuance never published and has to stay
 * tellable apart from it.
 */
export type SeasonalMonth = {
  /** The row's own id — a bigint, so a string, and *not* a PSGC. */
  id: string
  /** The forecast month as `YYYY-MM`, which is also the timeline's step id. */
  date: string
  rainfallMax: number | null
  rainfallMin: number | null
  /** The forecast total, in mm. */
  rainfallMean: number | null
  /** Percent of normal, where 100 is normal. Already normalized nationally. */
  rainfallPn: number | null
}

/**
 * A province's whole issuance.
 *
 * `psgc` and `months`, against the wire's `id` and `data`: the PSGC arrives in a
 * differently named field per product and means a *station* id in some of them
 * (docs/cis-api.md §3), so it is renamed here — at the fetch boundary the docs
 * ask for — rather than at each read. Same reason features.ts flattens the tile
 * properties: nothing downstream should have to remember whose spelling it is
 * holding.
 */
export type SeasonalProvince = {
  /** The 10-character PSGC. Joins to the boundary tiles by plain equality. */
  psgc: string
  name: string
  /** ISO with an explicit +08:00 offset — safe to hand to `new Date`. */
  issuedAt: string
  /** The issuance's months, earliest first. */
  months: SeasonalMonth[]
}

/** The wire shape, before the renaming above. */
type SeasonalProvinceRow = {
  id: string
  name: string
  issuedAt: string
  data: SeasonalMonth[]
}

export type SeasonalParams = {
  /**
   * The place, as its 10-character PSGC.
   *
   * `location=` also takes free text and fuzzy-matches it (docs/cis-api.md §3),
   * and this deliberately does not: the map addresses places by the code the
   * tile handed it, which resolves by exact match and cannot come back as some
   * neighbouring province the matcher liked better. Free text is a search box's
   * problem, and a search box would resolve to a code before asking for data.
   */
  psgc: string
  /**
   * One month, `YYYY-MM`.
   *
   * Omitting it returns the entire issuance rather than a default month, which
   * is what every caller in this app wants: six months in one response means a
   * scrubber moves through them without a request per step, and the account's
   * single rate-limit bucket (docs/cis-api.md §1) is spent once per place
   * rather than once per tick. It stays on the parameter list because the
   * endpoint takes it and a national fan-out for one month will want it.
   */
  date?: string
}

/**
 * The forecast for a place, as an array — a province PSGC resolves to itself, a
 * region's to every province in it, and both answer in the same shape.
 *
 * Provinces with no rows in the issuance are dropped server-side, so an empty
 * array means "resolved, nothing published" — the same reading as the `404`
 * described in docs/cis-api.md §6, and callers should treat the two alike.
 */
export async function fetchSeasonal(
  { psgc, date }: SeasonalParams,
  init?: RequestInit,
): Promise<SeasonalProvince[]> {
  const rows = await apiGet<SeasonalProvinceRow[]>(
    '/seasonal',
    { location: psgc, date },
    init,
  )

  return rows.map((row) => ({
    psgc: row.id,
    name: row.name,
    issuedAt: row.issuedAt,
    months: row.data,
  }))
}

/**
 * The month a timeline step names, or null if the issuance does not carry it.
 *
 * The two sides agree by construction — a seasonal step id is `YYYY-MM` and so
 * is `SeasonalMonth.date` — but only this file knows that, which is why the
 * lookup lives here rather than as a `find` at the call site. A miss is a real
 * state, not a defect: the window is derived from `latestData` and its span is
 * this app's assumption about the product (see config/timeline.ts), not
 * something the response promises.
 */
export const seasonalMonth = (
  province: SeasonalProvince,
  stepId: string | null,
): SeasonalMonth | null =>
  province.months.find((month) => month.date === stepId) ?? null

/**
 * One forecast month at one station.
 *
 * The same issuance as SeasonalMonth above, at points rather than polygons, and
 * a strict superset of it: everything the province row carries plus temperature,
 * the tercile probabilities, and the 1991–2020 normals each value is read
 * against.
 *
 * Two of these fields are the only seasonal temperature CIS publishes anywhere —
 * the province endpoint carries rainfall and nothing else — which is what makes
 * this shape worth rendering rather than a richer version of something already
 * on the map.
 *
 * Every value is nullable and independently so. Stations report rainfall and
 * temperature through different instruments, so a station with temperatures and
 * null rainfall is normal rather than broken (docs/cis-api.md §5); NAIA is one.
 */
export type SeasonalStationMonth = {
  /** The row's own id — a bigint, so a string, and *not* a station id. */
  id: string
  /** The forecast month as `YYYY-MM`, matching the timeline's step id. */
  date: string
  /** The forecast total, in mm. */
  rainfallMean: number | null
  /** Percent of normal, where 100 is normal. */
  rainfallPn: number | null
  /**
   * Above / near / below-normal tercile probabilities, summing to ~100.
   *
   * A different kind of statement from the two fields above: those are one
   * predicted number, these are the model's confidence spread across three
   * outcomes. Nothing maps them yet — a single pill cannot say three things —
   * but they are the substance of a station detail card.
   */
  rainfallProbAn: number | null
  rainfallProbNn: number | null
  rainfallProbBn: number | null
  tmax: number | null
  tmin: number | null
  /** Mean temperature in °C — the station layer's temperature reading. */
  tmean: number | null
  /** Signed departure from normal, in °C. Whether `tmean` is *unusual*. */
  tmeanAnomaly: number | null
  tmaxLow: number | null
  tmaxHigh: number | null
  tminLow: number | null
  tminHigh: number | null
  normalRainfall: number | null
  normalTmax: number | null
  normalTmin: number | null
}

/**
 * A station's whole issuance.
 *
 * `stationId` and `months`, against the wire's `id` and `data` — renamed here
 * for the reason SeasonalProvince is, with one addition that matters more: the
 * field called `id` on this endpoint is a **station id**, a number, while the
 * field called `id` on the province endpoint is a PSGC string (docs/cis-api.md
 * §3). Naming it `stationId` is what stops the two being compared.
 */
export type SeasonalStation = {
  /** Numeric, and joins to `Station.id` from api/stations — never to a PSGC. */
  stationId: number
  name: string
  /** ISO with an explicit +08:00 offset — safe to hand to `new Date`. */
  issuedAt: string
  /** The issuance's months, earliest first. */
  months: SeasonalStationMonth[]
}

/** The wire shape, before the renaming above. */
type SeasonalStationRow = {
  id: number
  station: string
  stationMeta: string
  issuedAt: string
  data: SeasonalStationMonth[]
}

const toSeasonalStation = (row: SeasonalStationRow): SeasonalStation => ({
  stationId: row.id,
  name: row.station,
  issuedAt: row.issuedAt,
  months: row.data,
})

/**
 * Every seasonal station inside a location — an **array**.
 *
 * `spatialRes=station` switches `GET /seasonal` from province rows to station
 * rows for the same resolved location, so one request answers for every station
 * in a region. That is what makes a national station layer 18 requests rather
 * than one per station, and it is why this exists alongside the single-station
 * endpoint below rather than instead of it.
 *
 * Stations the issuance holds no rows for are dropped server-side, the same way
 * provinces are, so an empty array means "resolved, nothing published".
 */
export async function fetchSeasonalStations(
  psgc: string,
  init?: RequestInit,
): Promise<SeasonalStation[]> {
  const rows = await apiGet<SeasonalStationRow[]>(
    '/seasonal',
    { location: psgc, spatialRes: 'station' },
    init,
  )
  return rows.map(toSeasonalStation)
}

/**
 * One station — `GET /seasonal/station`.
 *
 * The same object the array above is made of, in a different envelope: this
 * endpoint returns a bare object rather than a one-element array
 * (docs/cis-api.md §5). Normalising both through `toSeasonalStation` is what
 * keeps that inconsistency from reaching anything that reads a forecast.
 *
 * Addressed by numeric id rather than by name. The endpoint also fuzzy-matches a
 * station name, at a much looser threshold than locations use, and the map
 * always has the id already — a name that matched some neighbouring station
 * would be a wrong reading under the right label.
 */
export async function fetchSeasonalStation(
  stationId: number,
  init?: RequestInit,
): Promise<SeasonalStation> {
  const row = await apiGet<SeasonalStationRow>(
    '/seasonal/station',
    { station: stationId },
    init,
  )
  return toSeasonalStation(row)
}

/** The month a timeline step names at a station, or null if it carries none. */
export const seasonalStationMonth = (
  station: SeasonalStation,
  stepId: string | null,
): SeasonalStationMonth | null =>
  station.months.find((month) => month.date === stepId) ?? null
