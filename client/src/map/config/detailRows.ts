import type { SeasonalMonth, SeasonalStationMonth } from "@/api/seasonal";
import {
  RAINFALL_FORECAST_SCALE,
  SEASONAL_TEMPERATURE_SCALE,
} from "./colorScales";
import { finite } from "./seasonalReadings";
import type {
  SeasonalStationValueField,
  SeasonalValueField,
} from "./seasonalReadings";

/**
 * The rows of the detail panel's tables: which fields, in what order, printed
 * how, and under which variable.
 *
 * Declared here rather than in the table so the table stays a renderer — it
 * lays out whatever list it is handed, months across, rows down — and so what a
 * province and a station each *say* is readable in one place. A future row kind
 * (a sparkline, a probability bar) joins this union; the table learns to draw
 * it and nothing else moves.
 *
 * Generic over the month shape because the province and station rows are
 * different types on purpose (see SeasonalStationValueField): a row declared
 * for one cannot be read off the other.
 */
export type DetailRow<M> = {
  kind: "value";
  key: string;
  label: string;
  /** Set beside the label, not in every cell — the reference does the same. */
  unit?: string;
  /** The printed cell, or null for a month that carries no value. */
  format: (month: M) => string | null;
};

/**
 * One variable's rows: a card of its own in the detail panel, with its own
 * table and month header.
 *
 * `variableId` is the catalogue's (see PRODUCTS), which is how the panel knows
 * which card holds what the map is painting and opens that one.
 */
export type DetailGroup<M> = {
  variableId: string;
  label: string;
  /** The card's border, title and icon: a colour the variable's own map uses. */
  accent: string;
  rows: readonly DetailRow<M>[];
};

/**
 * Each variable's colour, taken from its own published scale so the card and
 * the map speak the same palette.
 *
 * Rainfall is the 200–300 mm class, the middle of the forecast ramp. The
 * temperature scale's middle is a pale yellow ("Warm") that cannot carry text
 * or a hairline on a white panel, so it takes the scale's strongest class
 * ("Very hot") instead — the hue the scale reserves for heat.
 */
const RAINFALL_ACCENT = RAINFALL_FORECAST_SCALE.classAt(250).color;
const TEMPERATURE_ACCENT = SEASONAL_TEMPERATURE_SCALE.classAt(30).color;

type Options = {
  unit?: string;
  decimals?: number;
  suffix?: string;
  signed?: boolean;
};

/**
 * One field, printed.
 *
 * Decimals default to zero, the precision SeasonalReading argues for rainfall;
 * temperature rows ask for one, for the same reason `temperature` does there.
 */
function value<M, F extends keyof M>(
  field: F,
  label: string,
  { unit, decimals = 0, suffix = "", signed = false }: Options = {},
): DetailRow<M> {
  return {
    kind: "value",
    key: String(field),
    label,
    unit,
    format: (month) => {
      const number = finite(month[field] as number | null);
      if (number === null) return null;
      const text = number.toFixed(decimals);
      // An anomaly reads as a direction first: "+0.6", never a bare "0.6" that
      // leaves the reader to guess which side of normal it is on.
      return `${signed && number > 0 ? "+" : ""}${text}${suffix}`;
    },
  };
}

/**
 * Two fields as one span, "32.3–37.0" — the forecast's own low and high for
 * a quantity, which read as a range and would be misread as two estimates if
 * given a row each. Null unless both ends are published.
 */
function range<M, F extends keyof M>(
  low: F,
  high: F,
  label: string,
  { unit, decimals = 1 }: Options = {},
): DetailRow<M> {
  return {
    kind: "value",
    key: `${String(low)}-${String(high)}`,
    label,
    unit,
    format: (month) => {
      const from = finite(month[low] as number | null);
      const to = finite(month[high] as number | null);
      if (from === null || to === null) return null;
      return `${from.toFixed(decimals)}–${to.toFixed(decimals)}`;
    },
  };
}

/**
 * A province: the four rainfall fields `/seasonal` publishes, and nothing else —
 * there is nothing else at this resolution (docs/cis-api.md §5).
 *
 * Percent of normal first, as in the reference: it is the one of the four that
 * reads the same in any month, and the mean beneath it is what gives it scale.
 */
export const PROVINCE_GROUPS: readonly DetailGroup<SeasonalMonth>[] = [
  {
    variableId: "rainfall",
    label: "Rainfall",
    accent: RAINFALL_ACCENT,
    rows: [
      value<SeasonalMonth, SeasonalValueField>("rainfallPn", "% of normal", {
        suffix: "%",
      }),
      value<SeasonalMonth, SeasonalValueField>("rainfallMean", "Mean", {
        unit: "mm",
      }),
      value<SeasonalMonth, SeasonalValueField>("rainfallMax", "Max", {
        unit: "mm",
      }),
      value<SeasonalMonth, SeasonalValueField>("rainfallMin", "Min", {
        unit: "mm",
      }),
    ],
  },
];

type S = SeasonalStationMonth;
type SF = SeasonalStationValueField;

/**
 * A station: everything `/seasonal/station` publishes, grouped by variable.
 *
 * Each quantity's normal sits under the forecast it qualifies rather than in a
 * block of normals at the bottom, so a reader comparing the two looks at
 * adjacent rows. The terciles close the rainfall group because they are a
 * statement *about* the forecast above them — how sure the model is of it.
 */
export const STATION_GROUPS: readonly DetailGroup<S>[] = [
  {
    variableId: "rainfall",
    label: "Rainfall",
    accent: RAINFALL_ACCENT,
    rows: [
      value<S, SF>("rainfallMean", "Mean", { unit: "mm" }),
      value<S, SF>("rainfallPn", "% of normal", { suffix: "%" }),
      value<S, SF>("normalRainfall", "Normal", { unit: "mm" }),
      value<S, SF>("rainfallProbAn", "Above normal", { suffix: "%" }),
      value<S, SF>("rainfallProbNn", "Near normal", { suffix: "%" }),
      value<S, SF>("rainfallProbBn", "Below normal", { suffix: "%" }),
    ],
  },
  {
    variableId: "temperature",
    label: "Temperature",
    accent: TEMPERATURE_ACCENT,
    rows: [
      value<S, SF>("tmean", "Mean", { unit: "°C", decimals: 1 }),
      value<S, SF>("tmeanAnomaly", "Anomaly", {
        unit: "°C",
        decimals: 1,
        signed: true,
      }),
      value<S, SF>("tmax", "Max", { unit: "°C", decimals: 1 }),
      range<S, SF>("tmaxLow", "tmaxHigh", "Max range", { unit: "°C" }),
      value<S, SF>("normalTmax", "Normal max", { unit: "°C", decimals: 1 }),
      value<S, SF>("tmin", "Min", { unit: "°C", decimals: 1 }),
      range<S, SF>("tminLow", "tminHigh", "Min range", { unit: "°C" }),
      value<S, SF>("normalTmin", "Normal min", { unit: "°C", decimals: 1 }),
    ],
  },
];
