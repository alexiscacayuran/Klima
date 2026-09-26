import type { SeasonalMonth, SeasonalStationMonth } from "@/api/seasonal";
import {
  RAINFALL_FORECAST_SCALE,
  RAINFALL_PERCENT_OF_NORMAL_SCALE,
  RAINFALL_TERCILE_SCALES,
  SEASONAL_TEMPERATURE_SCALE,
  TERCILE_TAGS,
} from "./colorScales";
import type { ColorScale, Tercile } from "./colorScales";
import { DEFAULT_PRODUCT_ID, variableKey } from "./products";
import { symbologyModeFor } from "./rasters";
import { finite, tercileProbabilities } from "./seasonalReadings";
import type {
  SeasonalStationValueField,
  SeasonalValueField,
} from "./seasonalReadings";

/**
 * The rows of the detail panel's tables: which fields, in what order and which
 * sections, printed and coloured how, and under which variable.
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
export type DetailRow<M> =
  | (RowBase & {
      kind: "value";
      /** The printed cell, or null for a month that carries no value. */
      format: (month: M) => Figure | null;
    })
  | (RowBase & {
      kind: "stack";
      /**
       * Several figures in one cell, top to bottom, or null unless the month
       * publishes every one: a stack short a figure would shift the rest into
       * the wrong places.
       */
      format: (month: M) => readonly Figure[] | null;
    });

/** One number as a cell prints it, with the colour it is on the map. */
export type Figure = {
  text: string;
  /**
   * The value's colour on the map (see paintAs), which the table reveals on
   * hover. Absent for a quantity no published scale covers.
   */
  fill?: string;
  /**
   * A short name printed beside the figure — "AN" — for a stack whose figures
   * are different outcomes rather than two ends of one quantity.
   */
  tag?: string;
  /**
   * What the figure is, spoken before it — "High", "Above normal". In a stack,
   * position and a tag say which figure is which on screen, and neither
   * reaches a screen reader.
   */
  label?: string;
};

type RowBase = {
  key: string;
  label: string;
  /** Set beside the label, not in every cell — the reference does the same. */
  unit?: string;
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
  /**
   * The card's title and icon, and its table's outline: a colour the
   * variable's own map uses.
   */
  accent: string;
  /**
   * The rows in sections, each the rows about one quantity — a forecast, its
   * range, its normal. The table rules between sections and not within one,
   * so what belongs together reads as a block.
   */
  sections: readonly (readonly DetailRow<M>[])[];
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
  paint?: Paint;
};

/** A value's colour on the map. */
type Paint = (value: number) => string;

/**
 * How the map colours a value of a layer: the layer's published scale, under
 * the mode the layer declares — the same call the pills and the popup make
 * (see ColorScale.colorFor), so a cell and the map cannot disagree about one
 * number.
 */
function paintAs(scale: ColorScale, layer: string): Paint {
  const mode = symbologyModeFor(layer);
  return (value) => scale.colorFor(value, mode);
}

const seasonal = (variableId: string, layerId?: string) =>
  variableKey(DEFAULT_PRODUCT_ID, variableId, layerId);

/**
 * Every quantity in millimetres takes the forecast's scale: a normal, a max or
 * a min is the same kind of monthly total, and a second table for it would
 * paint one amount two colours.
 */
const RAINFALL = paintAs(
  RAINFALL_FORECAST_SCALE,
  seasonal("rainfall", "forecast"),
);
const PERCENT_OF_NORMAL = paintAs(
  RAINFALL_PERCENT_OF_NORMAL_SCALE,
  seasonal("rainfall", "percent-of-normal"),
);
const TERCILE_LAYER = seasonal("rainfall", "probabilistic-forecast");
const TERCILE_PAINTS: Record<Tercile, Paint> = {
  above: paintAs(RAINFALL_TERCILE_SCALES.above, TERCILE_LAYER),
  near: paintAs(RAINFALL_TERCILE_SCALES.near, TERCILE_LAYER),
  below: paintAs(RAINFALL_TERCILE_SCALES.below, TERCILE_LAYER),
};
/**
 * Every temperature takes the one seasonal temperature scale, the only one
 * published. It was drawn for the mean, so a max over 30 °C sits in its top
 * class. The anomaly takes none: it is a departure rather than a temperature,
 * and on this ramp +0.6 °C would read as cool.
 */
const TEMPERATURE = paintAs(
  SEASONAL_TEMPERATURE_SCALE,
  seasonal("temperature"),
);

/**
 * One field, printed.
 *
 * Decimals default to zero, the precision SeasonalReading argues for rainfall;
 * temperature rows ask for one, for the same reason `temperature` does there.
 */
function value<M, F extends keyof M>(
  field: F,
  label: string,
  { unit, decimals = 0, suffix = "", signed = false, paint }: Options = {},
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
      return {
        // An anomaly reads as a direction first: "+0.6", never a bare "0.6"
        // that leaves the reader to guess which side of normal it is on.
        text: `${signed && number > 0 ? "+" : ""}${text}${suffix}`,
        fill: paint?.(number),
      };
    },
  };
}

/**
 * Two fields as one cell, the high over the low — the forecast's own spread
 * for a quantity, which would be misread as two estimates if given a row each.
 */
function range<M, F extends keyof M>(
  low: F,
  high: F,
  label: string,
  { unit, decimals = 1, paint }: Options = {},
): DetailRow<M> {
  return {
    kind: "stack",
    key: `${String(low)}-${String(high)}`,
    label,
    unit,
    format: (month) => {
      const from = finite(month[low] as number | null);
      const to = finite(month[high] as number | null);
      if (from === null || to === null) return null;
      return [
        { text: to.toFixed(decimals), fill: paint?.(to), label: "High" },
        { text: from.toFixed(decimals), fill: paint?.(from), label: "Low" },
      ];
    },
  };
}

/** Each outcome in words, for the reader who cannot see its tag. */
const TERCILE_NAMES: Record<Tercile, string> = {
  above: "Above normal",
  near: "Near normal",
  below: "Below normal",
};

/**
 * The three outcome probabilities as one cell, stacked in the order the legend
 * draws them — above, near, below — each tagged with PAGASA's abbreviation.
 *
 * One row rather than three: together they are a single statement, 100% split
 * between the outcomes, and they are read against each other.
 */
function terciles(label: string): DetailRow<SeasonalStationMonth> {
  return {
    kind: "stack",
    key: "terciles",
    label,
    format: (month) =>
      tercileProbabilities(month)?.map(({ tercile, probability }) => ({
        // Whole percent: the published bands are five points wide.
        text: `${probability.toFixed(0)}%`,
        fill: TERCILE_PAINTS[tercile](probability),
        tag: TERCILE_TAGS[tercile],
        label: TERCILE_NAMES[tercile],
      })) ?? null,
  };
}

/**
 * A province: the four rainfall fields `/seasonal` publishes, and nothing else —
 * there is nothing else at this resolution (docs/cis-api.md §5).
 *
 * Percent of normal first, as in the reference: it is the one of the four that
 * reads the same in any month, and the mean beneath it is what gives it scale.
 * The two share a section; the forecast's max and min, its spread, take the
 * next.
 */
export const PROVINCE_GROUPS: readonly DetailGroup<SeasonalMonth>[] = [
  {
    variableId: "rainfall",
    label: "Rainfall",
    accent: RAINFALL_ACCENT,
    sections: [
      [
        value<SeasonalMonth, SeasonalValueField>("rainfallPn", "% of normal", {
          suffix: "%",
          paint: PERCENT_OF_NORMAL,
        }),
        value<SeasonalMonth, SeasonalValueField>("rainfallMean", "Mean", {
          unit: "mm",
          paint: RAINFALL,
        }),
      ],
      [
        value<SeasonalMonth, SeasonalValueField>("rainfallMax", "Max", {
          unit: "mm",
          paint: RAINFALL,
        }),
        value<SeasonalMonth, SeasonalValueField>("rainfallMin", "Min", {
          unit: "mm",
          paint: RAINFALL,
        }),
      ],
    ],
  },
];

type S = SeasonalStationMonth;
type SF = SeasonalStationValueField;

/**
 * A station: everything `/seasonal/station` publishes, grouped by variable.
 *
 * Each quantity's normal sits under the forecast it qualifies, in its section,
 * rather than in a block of normals at the bottom, so a reader comparing the
 * two looks at adjacent rows. The terciles close the rainfall group, a section
 * of their own, because they are a statement *about* the forecast above them —
 * how sure the model is of it.
 */
export const STATION_GROUPS: readonly DetailGroup<S>[] = [
  {
    variableId: "rainfall",
    label: "Rainfall",
    accent: RAINFALL_ACCENT,
    sections: [
      [
        value<S, SF>("rainfallMean", "Mean", { unit: "mm", paint: RAINFALL }),
        value<S, SF>("rainfallPn", "% of normal", {
          suffix: "%",
          paint: PERCENT_OF_NORMAL,
        }),
        value<S, SF>("normalRainfall", "Normal", {
          unit: "mm",
          paint: RAINFALL,
        }),
      ],
      [terciles("Probability")],
    ],
  },
  {
    variableId: "temperature",
    label: "Temperature",
    accent: TEMPERATURE_ACCENT,
    sections: [
      [
        value<S, SF>("tmean", "Mean", {
          unit: "°C",
          decimals: 1,
          paint: TEMPERATURE,
        }),
        value<S, SF>("tmeanAnomaly", "Anomaly", {
          unit: "°C",
          decimals: 1,
          signed: true,
        }),
      ],
      [
        value<S, SF>("tmax", "Max", {
          unit: "°C",
          decimals: 1,
          paint: TEMPERATURE,
        }),
        range<S, SF>("tmaxLow", "tmaxHigh", "Max range", {
          unit: "°C",
          paint: TEMPERATURE,
        }),
        value<S, SF>("normalTmax", "Normal max", {
          unit: "°C",
          decimals: 1,
          paint: TEMPERATURE,
        }),
      ],
      [
        value<S, SF>("tmin", "Min", {
          unit: "°C",
          decimals: 1,
          paint: TEMPERATURE,
        }),
        range<S, SF>("tminLow", "tminHigh", "Min range", {
          unit: "°C",
          paint: TEMPERATURE,
        }),
        value<S, SF>("normalTmin", "Normal min", {
          unit: "°C",
          decimals: 1,
          paint: TEMPERATURE,
        }),
      ],
    ],
  },
];
