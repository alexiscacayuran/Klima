import { apiGet } from './client'

/**
 * The seasonal forecast — `GET /seasonal`.
 *
 * One issuance, six months ahead, published per province (docs/cis-api.md §5).
 * The station shape — richer, with temperature and terciles — is a different
 * endpoint at a different resolution; it belongs in this file too when
 * something renders points, and is deliberately not stubbed before then.
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
