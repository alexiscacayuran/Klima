import { cn } from "@/lib/utils";
import { RAINFALL_PERCENT_OF_NORMAL_SCALE } from "@/map/config/colorScales";
import { formatStepId } from "@/map/config/timeline";
import type { TemperatureQuantity } from "./temperatureSeries";

/**
 * The values the seasonal charts share, apart from the components that use
 * them (see ChartFrame, markers) so each file there exports components only.
 */

/**
 * The theme's colours as SVG takes them. Raw CIS tokens rather than Tailwind
 * classes: recharts sets these as attributes on elements it creates.
 */
export const INK = "var(--cis-fg-heading)";
export const BODY = "var(--cis-fg-body)";
export const GRID = "var(--cis-line)";
/** The panel under the charts, for the gaps and halos that part marks. */
export const SURFACE = "var(--cis-panel-solid)";

/**
 * The plot's box. Its height is the chart's own; the rest re-inks shadcn's
 * neutral chrome with the CIS tokens the table uses, and sets the ticks in the
 * panel's face.
 */
export const plotClass = (height: string) =>
  cn(
    "aspect-auto w-full font-cis text-[11px] tabular-nums",
    "[&_.recharts-cartesian-axis-tick_text]:fill-fg-body",
    height,
  );

/**
 * The room left of the y axis, so its widest tick — "1250", "160%" — keeps
 * clear of the card's outline rather than running into it.
 */
export const AXIS_INSET = 8;

/** The tooltip's box, in the panel's colours rather than shadcn's. */
export const tooltipClass = "border-line bg-panel-solid font-cis";

/** The tooltip's heading: the month in full, as the table's column title. */
export const tooltipMonth = (date: unknown) => formatStepId(String(date));

/**
 * The timeline's month as a band behind its column — or its row, on the
 * tercile chart — as the table lights the same month's column.
 */
export const CURRENT_FILL = "var(--cis-fg-subtle)";
export const CURRENT_OPACITY = 0.18;

/**
 * The charts' hues, one shade each: wherever a chart draws red, it is this red,
 * whatever the red stands for. A chart painted by a published scale (percent
 * of normal) paints with the scale; every other colour comes from here.
 *
 * Four are percent of normal's own classes, so the chart that has to use them
 * and the charts that choose to agree — its yellow, green and blue are the
 * same three outcomes on the tercile chart, named the same.
 *
 * Orange is the one hue that scale lacks. It sits between the red and the
 * yellow, lighter than the red so that the two stay apart for a reader with a
 * red–green deficiency; that costs it contrast on the white panel, where the
 * tooltip and the table carry its figures.
 */
export const RED = RAINFALL_PERCENT_OF_NORMAL_SCALE.classAt(0).color;
export const YELLOW = RAINFALL_PERCENT_OF_NORMAL_SCALE.classAt(40).color;
export const GREEN = RAINFALL_PERCENT_OF_NORMAL_SCALE.classAt(80).color;
export const BLUE = RAINFALL_PERCENT_OF_NORMAL_SCALE.classAt(120).color;
export const ORANGE = "#f28c28";

/**
 * Each temperature's own colour where they share a plot — red for the max,
 * orange for the mean, blue for the min, hot to cool as they sit on the axis —
 * its normal and its range drawn in the same.
 */
export const TEMPERATURE_COLORS: Record<TemperatureQuantity, string> = {
  tmax: RED,
  tmean: ORANGE,
  tmin: BLUE,
};

/**
 * A range band's fill, as a wash of its colour: the band is where the forecast
 * could fall, and must not outweigh the lines drawn across it.
 */
export const BAND_OPACITY = 0.14;

/** A normal drawn as a line: dashed, the way a baseline reads. */
export const NORMAL_DASH = "4 3";

/**
 * The dot every month of a forecast line carries, ringed in the panel's colour
 * so it stays whole where it crosses another line or a band's edge.
 */
export const forecastDot = (color: string) => ({
  r: 3.5,
  fill: color,
  stroke: SURFACE,
  strokeWidth: 2,
});

/**
 * A figure as the tooltip prints it, to the places the table prints it to, or
 * the table's dash for a month without one. Signed on request, so a departure
 * reads as a direction first — "+0.6", never a bare "0.6".
 */
export function figure(
  value: number | null | undefined,
  { decimals = 0, suffix = "", signed = false } = {},
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const text = value.toFixed(decimals);
  // Judged on the rounded figure, so -0.04 prints "0.0" rather than "-0.0".
  if (Number(text) === 0) return `${(0).toFixed(decimals)}${suffix}`;
  return `${signed && value > 0 ? "+" : ""}${text}${suffix}`;
}

/** Whole units — millimetres and percentages, as the table prints them. */
export const whole = (value: number | null | undefined, suffix = "") =>
  figure(value, { suffix });

/** Tenths of a degree, as the table prints a temperature. */
export const celsius = (value: number | null | undefined) =>
  figure(value, { decimals: 1, suffix: " °C" });
