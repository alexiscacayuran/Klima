import { apiGet } from './client'

/**
 * The drought assessment and outlook — `GET /drought/assessment` and
 * `GET /drought/outlook`.
 *
 * Monthly, per province, and categorical: one issuance publishes seven months,
 * the earliest its **assessment** and the six after it its **outlook**
 * (docs/cis-api.md §5), and every month says which of four statuses each
 * province is in. There is no number behind a status to place on a ramp, which
 * is what makes this the one product the map paints as a choropleth of classes
 * rather than as a surface.
 *
 * The two endpoints are the two rail layers, one each. `GET /drought` — the same
 * months as one province's series — is the shape for a detail panel and is not
 * read here.
 */

/**
 * The four statuses, mildest first, spelled as CIS spells them — both as the
 * keys it groups provinces under and in its `/drought/legend`. Not display
 * strings that happen to match: they are compared against the wire, so they
 * must not be prettified. The order is the legend's.
 */
export const DROUGHT_STATUSES = [
  'Not affected',
  'Dry condition',
  'Dry spell',
  'Drought',
] as const

export type DroughtStatus = (typeof DROUGHT_STATUSES)[number]

const isDroughtStatus = (value: string): value is DroughtStatus =>
  (DROUGHT_STATUSES as readonly string[]).includes(value)

/** Which half of an issuance a month belongs to, as the wire's `type` says. */
export type DroughtSeries = 'assessment' | 'outlook'

/** One month of drought status across whatever location was asked for. */
export type DroughtMonth = {
  series: DroughtSeries
  /** `YYYY-MM`, which is also the timeline's step id. */
  date: string
  /** ISO with an explicit +08:00 offset — safe to hand to `new Date`. */
  issuedAt: string
  /**
   * Each province's status, keyed by the PSGC the boundary tiles carry.
   *
   * The wire's grouping turned inside out: CIS lists provinces *under* each
   * status, which suits a legend that counts them, while everything on the map
   * starts from a unit and asks what it is in. Inverted once here, at the fetch
   * boundary, rather than searched four lists deep per polygon per frame.
   *
   * A province missing from the map is one the month says nothing about, which
   * is a different fact from "Not affected" and has to stay tellable apart.
   */
  statuses: ReadonlyMap<string, DroughtStatus>
  /**
   * Each of those provinces' names as CIS lists them, keyed the same way — for
   * a reader that names the provinces it counts (the overview's island lists),
   * which the boundary tiles cannot do for it outside the map.
   */
  names: ReadonlyMap<string, string>
}

/** One month as it arrives. */
type DroughtMonthRow = {
  type: DroughtSeries
  date: string
  issuedAt: string
  /**
   * All four keys always present, empty arrays included. `id` is the PSGC —
   * this endpoint names no stations, so unlike seasonal there is no second
   * meaning to rename it away from.
   */
  data: Record<string, { id: string; name: string; islandGroup: string | null }[]>
}

const toDroughtMonth = (row: DroughtMonthRow): DroughtMonth => {
  const statuses = new Map<string, DroughtStatus>()
  const names = new Map<string, string>()
  for (const [status, provinces] of Object.entries(row.data)) {
    // A status this build does not know is dropped rather than guessed at: a
    // fifth class added server-side has a colour nobody here has been given, and
    // painting it as one of the four would misstate what the province is in.
    if (!isDroughtStatus(status)) continue
    for (const province of provinces) {
      statuses.set(province.id, status)
      names.set(province.id, province.name)
    }
  }
  return {
    series: row.type,
    date: row.date,
    issuedAt: row.issuedAt,
    statuses,
    names,
  }
}

/**
 * The months of one series for a location, earliest first.
 *
 * - **assessment** is asked with `historical=true`: up to the six most recent
 *   assessments rather than the current one alone, which is what gives the
 *   layer's timeline something to scrub. A month with no issuance is simply
 *   absent, so the answer can hold fewer than six.
 * - **outlook** is asked without a `date`, which answers with all six outlook
 *   months of the newest issuance in one response.
 *
 * `location` is a PSGC, a place name or — for drought alone — an island group
 * (docs/cis-api.md §3); the national reader passes the last (see
 * api/normalize `fetchAllIslandGroups`).
 */
export async function fetchDroughtSeries(
  series: DroughtSeries,
  location: string,
  init?: RequestInit,
): Promise<DroughtMonth[]> {
  const rows = await apiGet<DroughtMonthRow[] | DroughtMonthRow>(
    `/drought/${series}`,
    { location, historical: series === 'assessment' ? 'true' : undefined },
    init,
  )
  // `/drought/outlook` answers one *object* when given a `date` and an array
  // without one (docs/cis-api.md §5). No `date` is sent, but the envelope is
  // the endpoint's to choose, so it is normalised rather than assumed.
  return (Array.isArray(rows) ? rows : [rows]).map(toDroughtMonth)
}

/**
 * Months from several locations — a fan-out's parts — folded into one per date,
 * earliest first.
 *
 * Each island group answers with the same months carrying its own provinces, so
 * the fold is a union of the status and name maps. `issuedAt` is the newest any part
 * reports, though within one month every part names the same issuance.
 */
export function mergeDroughtMonths(parts: readonly DroughtMonth[]): DroughtMonth[] {
  const byDate = new Map<string, DroughtMonth>()
  for (const part of parts) {
    const held = byDate.get(part.date)
    if (!held) {
      byDate.set(part.date, {
        ...part,
        statuses: new Map(part.statuses),
        names: new Map(part.names),
      })
      continue
    }
    const statuses = held.statuses as Map<string, DroughtStatus>
    const names = held.names as Map<string, string>
    for (const [psgc, status] of part.statuses) statuses.set(psgc, status)
    for (const [psgc, name] of part.names) names.set(psgc, name)
    if (part.issuedAt > held.issuedAt) held.issuedAt = part.issuedAt
  }
  return [...byDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
}
