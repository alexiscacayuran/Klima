import type { SeasonalMonth, SeasonalStationMonth } from '@/api/seasonal'
import type { ColorScale } from './colorScales'
import {
  RAINFALL_FORECAST_SCALE,
  RAINFALL_PERCENT_OF_NORMAL_SCALE,
  SEASONAL_TEMPERATURE_SCALE,
} from './colorScales'
import { parseVariableKey } from './products'

/**
 * Which single number a selected seasonal layer reads, and how it is printed.
 *
 * Where the two vocabularies meet. The rail names layers — "Rainfall →
 * Forecast", "Rainfall → Percent of Normal" — and the API answers with a row
 * carrying four rainfall fields at once; this file is the one place that says
 * which field each layer is *about*. A selection reads that field and no other,
 * so the popup and the choropleth cannot end up quoting different numbers for
 * the same selected layer.
 *
 * Keyed by the variable and layer segments of a `variableKey`, without the
 * product: the product is already known to be seasonal by the time anything
 * looks here (see hooks/useSeasonalForecast), and repeating it would put the
 * same string in every key.
 */

/**
 * The fields a reading can point at: the numeric ones, derived rather than
 * listed, so a field added to the response is selectable here without an edit
 * and `date` or `id` stays unselectable.
 */
export type SeasonalValueField = {
  [K in keyof SeasonalMonth]: SeasonalMonth[K] extends number | null ? K : never
}[keyof SeasonalMonth]

/**
 * The same, for the station row.
 *
 * A separate type rather than a widening of the one above, because the two
 * shapes overlap without nesting: the station row carries `tmean` and the
 * terciles that no province row has, and the province row carries `rainfallMax`
 * and `rainfallMin` that no station row has. Deriving one from the other would
 * make a field selectable at a resolution that does not publish it.
 */
export type SeasonalStationValueField = {
  [K in keyof SeasonalStationMonth]: SeasonalStationMonth[K] extends
    | number
    | null
    ? K
    : never
}[keyof SeasonalStationMonth]

export type SeasonalReading = {
  /**
   * The field this layer reads on a **province** row, when the province
   * endpoint publishes the quantity at all.
   *
   * Absent for a quantity CIS publishes only at stations, which is a real state
   * rather than a gap to fill: a layer with no province field paints no
   * choropleth and its popup says so, instead of quoting a station's number
   * under a province's name.
   */
  field?: SeasonalValueField
  /**
   * The field this layer reads on a **station** row.
   *
   * Usually the same quantity as `field` under the same name — the station row
   * is the same issuance at points — and the only field for `temperature`.
   * Absent for a quantity stations do not report.
   */
  stationField?: SeasonalStationValueField
  /** What the number is, for a reader. */
  label: string
  /**
   * A mark that belongs *inside* the value, tight against the digits and at
   * their size — a percentage sign, which reads as part of the number rather
   * than as a quantity it is measured in.
   */
  suffix?: string
  /**
   * A unit that belongs *beside* the value, set apart and smaller, so the
   * number carries the weight. The two are separate fields rather than one
   * because they are typeset differently, and a reading has at most one.
   */
  unit?: string
  /**
   * Places kept. Zero for both fields CIS publishes today, and not an
   * oversight: a monthly rainfall total forecast six months out is a number
   * with three significant figures at best, and a percent of normal is read
   * against 100. The extra decimals in the response are the model's arithmetic,
   * not its precision — the same reasoning as DECIMALS in utils/coordinates.
   */
  decimals: number
  /**
   * The layer's published symbology (see config/colorScales).
   *
   * What makes a reading say something rather than only state a number: the
   * scale is what turns 130% into "Above normal" and gives the popup the same
   * ink the choropleth will paint that province with. Required, not optional —
   * a layer this file can name a field for is a layer something will map, and
   * a mapped layer without a symbology is a hole the legend would have to
   * apologise for.
   */
  scale: ColorScale
}

const SEASONAL_READINGS: Record<string, SeasonalReading> = {
  'rainfall:forecast': {
    field: 'rainfallMean',
    stationField: 'rainfallMean',
    label: 'Forecast rainfall',
    unit: 'mm',
    decimals: 0,
    scale: RAINFALL_FORECAST_SCALE,
  },
  'rainfall:percent-of-normal': {
    field: 'rainfallPn',
    stationField: 'rainfallPn',
    label: 'Percent of normal',
    suffix: '%',
    decimals: 0,
    scale: RAINFALL_PERCENT_OF_NORMAL_SCALE,
  },
  // Station-only, and the reason the two halves of a reading are separate
  // fields. The province endpoint carries rainfall and nothing else, so there
  // is no `field` to give this and a choropleth of it cannot exist; the seasonal
  // temperature CIS publishes is per station (docs/cis-api.md §5). The entry
  // used to be absent entirely, which said the same thing when nothing rendered
  // points — now that something does, saying it as a missing `field` is what
  // keeps the pill readable and the popup honest.
  //
  // One decimal, against zero for both rainfall fields. Not an inconsistency:
  // a monthly rainfall total forecast six months out has three significant
  // figures at best, while the national spread of `tmean` is 18–30 °C, so a
  // whole degree is a tenth of the entire range and rounding to it would merge
  // bands the scale distinguishes.
  temperature: {
    stationField: 'tmean',
    label: 'Mean temperature',
    unit: '°C',
    decimals: 1,
    scale: SEASONAL_TEMPERATURE_SCALE,
  },
}

/** The reading a selected layer is about, or null if it has none. */
export function seasonalReadingFor(
  variableKey: string | null,
): SeasonalReading | null {
  const parts = parseVariableKey(variableKey)
  if (!parts) return null
  const key = parts.layerId
    ? `${parts.variableId}:${parts.layerId}`
    : parts.variableId
  return SEASONAL_READINGS[key] ?? null
}

/**
 * The month's number for this reading, or null when it carries none.
 *
 * Null is the response's own answer for a month with no stored aggregate
 * (docs/cis-api.md §6), so it is returned rather than coerced into a zero —
 * the caller says "no value" in words, which is a different thing from "0 mm".
 *
 * Separate from the formatter below because the raw number has a second reader:
 * the scale, which classifies it. Formatting first and parsing back would round
 * a 49.6 mm forecast to "50" and then classify the string, moving it into the
 * next class on the legend — the printed value is a rounding of the reading,
 * not the reading itself.
 */
export function seasonalValue(
  reading: SeasonalReading,
  month: SeasonalMonth,
): number | null {
  if (!reading.field) return null
  return finite(month[reading.field])
}

/**
 * The same, read off a station row.
 *
 * Separate from `seasonalValue` rather than generic over the two shapes: the
 * field names are drawn from different unions precisely so a province field
 * cannot be read from a station row, and a function taking either would give
 * that back.
 */
export function seasonalStationValue(
  reading: SeasonalReading,
  month: SeasonalStationMonth,
): number | null {
  if (!reading.stationField) return null
  return finite(month[reading.stationField])
}

/**
 * A published number, or null for anything that is not one.
 *
 * Nulls are the response's own answer for a month with no stored aggregate, and
 * are returned rather than coerced to zero so the caller says "no value" in
 * words — a different thing from "0 mm". NaN and Infinity are folded in with
 * them: neither should reach a scale, which would classify them into the first
 * band and print a swatch for a value that does not exist.
 */
const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * The value as printed.
 *
 * `unit` is not appended here: it is set apart typographically, so placing it
 * is the caller's job (see the two fields on SeasonalReading).
 */
export function formatSeasonalValue(
  reading: SeasonalReading,
  value: number,
): string {
  return `${value.toFixed(reading.decimals)}${reading.suffix ?? ''}`
}
