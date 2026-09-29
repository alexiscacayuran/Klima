import type { SeasonalStationMonth } from "@/api/seasonal";
import { finite } from "@/map/config/seasonalReadings";

/**
 * One month of temperature as the charts read it, in °C.
 *
 * Station-only, as seasonal temperature is (docs/cis-api.md §5). Each
 * quantity — the mean, the max, the min — comes with the normal it is read
 * against, and the max and min with the low–high range the issuance publishes
 * for them; the mean has no range of its own, and a departure instead.
 */
export type TemperatureChartMonth = {
  /** `YYYY-MM` — every chart's month category, and the timeline's step id. */
  date: string;
  tmean: number | null;
  tmeanNormal: number | null;
  /** Signed departure of the mean from its normal. */
  tmeanAnomaly: number | null;
  tmax: number | null;
  tmaxNormal: number | null;
  /** `[low, high]`, which is what a ranged Area draws — or null. */
  tmaxRange: [number, number] | null;
  tmin: number | null;
  tminNormal: number | null;
  tminRange: [number, number] | null;
};

/** A quantity a line chart draws, and the fields that go with it. */
export type TemperatureQuantity = "tmean" | "tmax" | "tmin";

/**
 * The three in the order a chart lists them: hot to cool, the order their
 * lines sit on the axis, so a key reads down the plot.
 */
export const TEMPERATURE_QUANTITIES = [
  "tmax",
  "tmean",
  "tmin",
] as const satisfies readonly TemperatureQuantity[];

/** Each as the table names its row. */
export const TEMPERATURE_NAMES: Record<TemperatureQuantity, string> = {
  tmax: "Max",
  tmean: "Mean",
  tmin: "Min",
};

/**
 * Each one's normal, named for the temperature it is the normal of — the
 * table's "Normal max" and "Normal min", and the mean's spelled out, since on a
 * chart with the others a bare "Normal" does not say whose.
 */
export const NORMAL_NAMES: Record<TemperatureQuantity, string> = {
  tmax: "Normal max",
  tmean: "Normal mean",
  tmin: "Normal min",
};

export const TEMPERATURE_KEYS = {
  tmean: { normal: "tmeanNormal", range: null },
  tmax: { normal: "tmaxNormal", range: "tmaxRange" },
  tmin: { normal: "tminNormal", range: "tminRange" },
} as const satisfies Record<
  TemperatureQuantity,
  {
    normal: keyof TemperatureChartMonth;
    range: keyof TemperatureChartMonth | null;
  }
>;

/**
 * A published range, or null unless both ends are.
 *
 * Not checked against the forecast inside it: the issuance publishes forecasts
 * that fall outside their own range (a January max 0.6 °C under its low), and
 * a band has nothing to clamp — it draws both, and the reader sees the miss.
 */
const range = (
  low: number | null,
  high: number | null,
): [number, number] | null =>
  low === null || high === null
    ? null
    : [Math.min(low, high), Math.max(low, high)];

/**
 * A station's months, with the anomaly derived from the mean and its normal
 * only where CIS left it out — the published figure is the one the table
 * quotes.
 */
export const stationTemperature = (
  months: readonly SeasonalStationMonth[],
): TemperatureChartMonth[] =>
  months.map((month) => {
    const tmean = finite(month.tmean);
    const tmeanNormal = finite(month.tmeanNormal);
    return {
      date: month.date,
      tmean,
      tmeanNormal,
      tmeanAnomaly:
        finite(month.tmeanAnomaly) ??
        (tmean !== null && tmeanNormal !== null ? tmean - tmeanNormal : null),
      tmax: finite(month.tmax),
      tmaxNormal: finite(month.tmaxNormal),
      tmaxRange: range(finite(month.tmaxLow), finite(month.tmaxHigh)),
      tmin: finite(month.tmin),
      tminNormal: finite(month.tminNormal),
      tminRange: range(finite(month.tminLow), finite(month.tminHigh)),
    };
  });
