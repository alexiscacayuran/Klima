import { apiGet } from './client'

/**
 * The PSGC reference list — `GET /locations`.
 *
 * Every region, province, city, municipality and Manila district CIS knows, and
 * the table every `location=` parameter resolves against (docs/cis-api.md §5).
 * Reference data like `/stations`: authenticated, never product-scoped, so any
 * token reads all 1,758 rows.
 *
 * It carries no parent field. The hierarchy is in the code itself — region,
 * province, municipality, barangay as 2 + 3 + 2 + 3 digits — which is what
 * `describePlace` below reads it from.
 */

/**
 * One place, as the panel needs it.
 *
 * Renamed away from the wire for the reasons api/seasonal.ts gives: `id` is
 * `psgc` because that is what it is everywhere else in the app, `geogLevel` is
 * `geoLevel` to match AdminLocation, and `status` — `"Capital"` or null, and
 * nothing else — is the boolean it has only ever been.
 */
export type PsgcLocation = {
  /** The 10-character PSGC. Joins to the boundary tiles by plain equality. */
  psgc: string
  name: string
  /** `Reg`, `Prov`, `City`, `Mun`, `SubMun`, or null for two wrapper rows. */
  geoLevel: string | null
  /** A former name, for 81 rows. */
  oldName: string | null
  /** A provincial capital — one of 82, one per province. */
  capital: boolean
  /** The same unit in the 9-digit PSGC; null for the 12 units created since. */
  oldPsgc: string | null
  /** `Luzon`, `Visayas` or `Mindanao`, assigned by region. Always set. */
  islandGroup: string
}

/** The wire shape, before the renaming above. */
type LocationRow = {
  id: string
  name: string
  geogLevel: string | null
  oldName: string | null
  status: string | null
  oldId: string | null
  islandGroup: string
}

/**
 * Every place, in one request.
 *
 * Unfiltered on purpose. Describing one place needs the rest around it — the
 * region above it, the capital and the municipalities inside it — and the doc's
 * own advice is to fetch the whole list once and filter on the client. At about
 * 228 KB it is the largest reference response the app reads, so it is only
 * asked for when something needs it (see useLocations).
 */
export async function fetchLocations(
  init?: RequestInit,
): Promise<PsgcLocation[]> {
  const rows = await apiGet<LocationRow[]>('/locations', undefined, init)
  return rows.map((row) => ({
    psgc: row.id,
    name: repairName(row.name),
    geoLevel: row.geogLevel,
    oldName: row.oldName === null ? null : repairName(row.oldName),
    capital: row.status === 'Capital',
    oldPsgc: row.oldId,
    islandGroup: row.islandGroup,
  }))
}

/**
 * Put back the `ñ` the API loses.
 *
 * CIS sends a literal U+FFFD where the source has `ñ` — "City of Las Pi�as",
 * "Santo Ni�o" — so the character is replaced before it is ever served, not
 * mis-decoded here. Which letter it was is not recoverable in general, but in
 * this list it is: U+FFFD is the only non-ASCII character in all 1,758 rows,
 * and each of its 20 occurrences is a lowercase `ñ`. Undone here, at the fetch
 * boundary, so no reader has to know about it; drop this when CIS fixes it.
 */
const repairName = (name: string): string => name.replaceAll('�', 'ñ')

/**
 * What the list says about one place and the places around it.
 *
 * `cities` and `municipalities` count what the code nests inside the place, so
 * a province's count leaves out the highly urbanised cities in it: PSGC codes
 * those in a province slot of their own (City of Cebu is `0730600000`, not
 * under Cebu's `07022`), which is also how the law treats them. A region's
 * count includes them.
 */
export type PlaceProfile = {
  place: PsgcLocation
  /** The region the place is in; null for a region. */
  region: PsgcLocation | null
  /**
   * The province the place is in; null for a region, a province, and a city
   * independent of any province. A provincial capital is the exception to that
   * last one: see `capitalOf`.
   */
  province: PsgcLocation | null
  /** A province's capital. */
  capital: PsgcLocation | null
  /** A region's provinces, in code order. Empty for NCR, which has none. */
  provinces: { province: PsgcLocation; capital: PsgcLocation | null }[]
  cities: number
  municipalities: number
}

/** The digits a place shares with everything inside it, by its level. */
const REGION_DIGITS = 2
const PROVINCE_DIGITS = 5

const codeAt = (psgc: string, digits: number) =>
  psgc.slice(0, digits).padEnd(10, '0')

/**
 * The capital row whose province is `province`.
 *
 * By code first, which finds 74 of the 82. The other 8 are highly urbanised
 * cities — Lucena, Iloilo, Cebu, Tacloban, Cagayan de Oro, Butuan, Puerto
 * Princesa, Bacolod — coded in a province slot of their own, so nothing in the
 * 10-digit code ties them to the province they are the seat of. The 9-digit
 * code still nests them (Lucena `045624000` under Quezon `045600000`), and
 * matches each of the eight to exactly one province. Only the capital relation
 * falls back to it: it is what `status` asserts, where "which province is this
 * city in" has a different answer for an independent city.
 */
const isCapitalOf = (city: PsgcLocation, province: PsgcLocation) =>
  city.capital &&
  (codeAt(city.psgc, PROVINCE_DIGITS) === province.psgc ||
    (city.oldPsgc !== null &&
      province.oldPsgc !== null &&
      city.oldPsgc.slice(0, 4) === province.oldPsgc.slice(0, 4)))

const findCapital = (
  locations: readonly PsgcLocation[],
  province: PsgcLocation,
) => locations.find((row) => isCapitalOf(row, province)) ?? null

/**
 * One place, described from the list. Null when the list has no row for it —
 * a code that entered the tiles after CIS last loaded its PSGC data.
 */
export function describePlace(
  locations: readonly PsgcLocation[],
  byPsgc: ReadonlyMap<string, PsgcLocation>,
  psgc: string,
): PlaceProfile | null {
  const place = byPsgc.get(psgc)
  if (!place) return null

  const isRegion = place.geoLevel === 'Reg'
  const isProvince = place.geoLevel === 'Prov'

  const region = isRegion
    ? null
    : (byPsgc.get(codeAt(psgc, REGION_DIGITS)) ?? null)

  let province: PsgcLocation | null = null
  if (!isRegion && !isProvince) {
    const enclosing = byPsgc.get(codeAt(psgc, PROVINCE_DIGITS))
    if (enclosing?.geoLevel === 'Prov') province = enclosing
    else if (place.capital) {
      province =
        locations.find(
          (row) => row.geoLevel === 'Prov' && isCapitalOf(place, row),
        ) ?? null
    }
  }

  // What the place contains, by the code prefix it shares with its contents.
  // Provinces, cities and municipalities only: Manila's districts are not what
  // anyone reading this panel is counting.
  const scope = isRegion ? REGION_DIGITS : isProvince ? PROVINCE_DIGITS : null
  const prefix = scope === null ? null : psgc.slice(0, scope)
  const provinces: PsgcLocation[] = []
  let cities = 0
  let municipalities = 0
  if (prefix !== null) {
    for (const row of locations) {
      if (!row.psgc.startsWith(prefix)) continue
      if (row.geoLevel === 'Prov' && isRegion) provinces.push(row)
      else if (row.geoLevel === 'City') cities++
      else if (row.geoLevel === 'Mun') municipalities++
    }
  }

  return {
    place,
    region,
    province,
    capital: isProvince ? findCapital(locations, place) : null,
    provinces: provinces.map((row) => ({
      province: row,
      capital: findCapital(locations, row),
    })),
    cities,
    municipalities,
  }
}
