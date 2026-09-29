import type { SeasonalMonth, SeasonalStationMonth } from "@/api/seasonal";
import type { Tercile } from "@/map/config/colorScales";
import {
  dominantTercile,
  finite,
  tercileProbabilities,
} from "@/map/config/seasonalReadings";

/**
 * One month of rainfall as the charts read it: the single shape all three
 * rainfall charts take, whichever resolution the month came from.
 *
 * The province and station rows publish different subsets of the issuance
 * (see SeasonalStationValueField) — a province carries the forecast's max and
 * min and no normal, a station its normal and terciles and no max or min. Both
 * are adapted to this rather than each chart learning two row types, and a
 * field the resolution does not publish is null: the charts already have to
 * handle a null, since any published field can be one for a month
 * (docs/cis-api.md §6).
 */
export type RainfallChartMonth = {
  /** `YYYY-MM` — every chart's month category, and the timeline's step id. */
  date: string;
  /** The forecast total, in mm. */
  mean: number | null;
  min: number | null;
  max: number | null;
  /** The 1991–2020 normal the forecast is read against, in mm. */
  normal: number | null;
  /** Percent of normal, where 100 is normal. */
  pctNormal: number | null;
  /**
   * The max–min spread as offsets below and above the mean, which is what
   * recharts' ErrorBar draws from — not the two ends themselves. Null unless
   * the mean and both ends are published.
   */
  spread: [number, number] | null;
  /** Tercile probabilities in percent, all three or none (see TERCILE_KEYS). */
  probBelow: number | null;
  probNear: number | null;
  probAbove: number | null;
  /**
   * The outcome the month leans to — the one the station's pill prints — or
   * null unless all three probabilities are published.
   */
  likeliest: Tercile | null;
};

/** Where each outcome's probability sits on a RainfallChartMonth. */
export const TERCILE_KEYS = {
  below: "probBelow",
  near: "probNear",
  above: "probAbove",
} as const satisfies Record<Tercile, keyof RainfallChartMonth>;

/**
 * The forecast as a percent of its normal, or null without a normal to divide
 * by — including a normal of 0 mm, which a dry-season month at some stations
 * has, and which no forecast can be a percentage of.
 *
 * Unrounded, like every value here: the scale classifies the number itself,
 * and rounding first would move 120.4% into the class above it.
 */
export const percentOfNormal = (
  mean: number | null,
  normal: number | null,
): number | null =>
  mean !== null && normal !== null && normal > 0 ? (mean / normal) * 100 : null;

/**
 * The max and min as offsets from the mean, which is what ErrorBar takes.
 *
 * A month whose mean lies outside its own spread is a defect in the issuance
 * rather than something to hide, so it is reported — and still drawn, with the
 * offending arm clamped to nothing rather than inverted.
 */
export function spreadOffsets(
  date: string,
  mean: number | null,
  min: number | null,
  max: number | null,
): [number, number] | null {
  if (mean === null || min === null || max === null) return null;
  if (min > mean || mean > max) {
    warn(`rainfall ${date}: mean ${mean} lies outside min ${min}–max ${max}`);
  }
  return [Math.max(0, mean - min), Math.max(0, max - mean)];
}

/** A province's months: the forecast, its spread and its percent of normal. */
export const provinceRainfall = (
  months: readonly SeasonalMonth[],
): RainfallChartMonth[] =>
  months.map((month) => {
    const mean = finite(month.rainfallMean);
    const min = finite(month.rainfallMin);
    const max = finite(month.rainfallMax);
    return {
      date: month.date,
      mean,
      min,
      max,
      normal: null,
      pctNormal: finite(month.rainfallPn),
      spread: spreadOffsets(month.date, mean, min, max),
      probBelow: null,
      probNear: null,
      probAbove: null,
      likeliest: null,
    };
  });

/**
 * A station's months: the forecast against its normal, its percent of normal,
 * and the three outcome probabilities.
 *
 * The published percent of normal is the one quoted, as the table quotes it;
 * it is derived from the mean and normal only where CIS left it out.
 */
export const stationRainfall = (
  months: readonly SeasonalStationMonth[],
): RainfallChartMonth[] =>
  months.map((month) => {
    const mean = finite(month.rainfallMean);
    const normal = finite(month.rainfallNormal);
    const terciles = tercileProbabilities(month);
    const probabilities = new Map(
      terciles?.map(({ tercile, probability }) => [tercile, probability]),
    );
    if (terciles) {
      const total = [...probabilities.values()].reduce((a, b) => a + b, 0);
      // The published values carry four decimals, so a point either way is
      // rounding; past that the stack would visibly miss or overrun 100%.
      if (Math.abs(total - 100) > 1) {
        warn(`rainfall ${month.date}: terciles sum to ${total.toFixed(2)}%`);
      }
    }
    return {
      date: month.date,
      mean,
      min: null,
      max: null,
      normal,
      pctNormal: finite(month.rainfallPn) ?? percentOfNormal(mean, normal),
      spread: null,
      probBelow: probabilities.get("below") ?? null,
      probNear: probabilities.get("near") ?? null,
      probAbove: probabilities.get("above") ?? null,
      likeliest: terciles && dominantTercile(terciles).tercile,
    };
  });

/**
 * A malformed issuance, said in development. Production draws what it
 * was given without a word: the reader can do nothing about it, and a console
 * warning per render is noise to everyone else.
 */
function warn(message: string) {
  if (import.meta.env.DEV) console.warn(`[charts] ${message}`);
}
