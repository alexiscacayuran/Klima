import type { SeasonalMonth } from '@/api/seasonal'
import type { ColorScale } from './colorScales'
import {
  RAINFALL_FORECAST_SCALE,
  RAINFALL_PERCENT_OF_NORMAL_SCALE,
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

export type SeasonalReading = {
  /** The one field this layer reads. */
  field: SeasonalValueField
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
   * scale is what turns 240 mm into "Wet month" and gives the popup the same
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
    label: 'Forecast rainfall',
    unit: 'mm',
    decimals: 0,
    scale: RAINFALL_FORECAST_SCALE,
  },
  'rainfall:percent-of-normal': {
    field: 'rainfallPn',
    label: 'Percent of normal',
    suffix: '%',
    decimals: 0,
    scale: RAINFALL_PERCENT_OF_NORMAL_SCALE,
  },
  // No entry for `temperature`: the province endpoint carries rainfall only,
  // and the seasonal temperature CIS publishes is per station (docs/cis-api.md
  // §5). An absent entry is what tells a reader that, and inventing one from
  // the station endpoint would put a point reading under a province's name.
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
  const value = month[reading.field]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

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
