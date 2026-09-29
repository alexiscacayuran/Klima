import type { ReactNode } from "react";
import { formatStepMonth } from "@/map/config/timeline";
import { BODY, INK } from "./chartStyle";

/**
 * The frame the seasonal charts share: a titled figure with its key, the
 * month ticks, the tooltip's rows.
 *
 * Set in the table's terms wherever the two meet — a title is a row label, a
 * unit sits beside it in parentheses, the timeline's month is the lit one —
 * so switching tabs changes the form and nothing else.
 */

/**
 * One chart with its title and key.
 *
 * A figure, captioned by the title: the charts stack up to four to a card, and each
 * has to say what it is before its colours say anything. Anything that changes
 * what the plot shows sits at the far end of the title's row, so it reads as
 * part of the chart's heading rather than of its key.
 */
export function ChartFigure({
  title,
  unit,
  controls,
  legend,
  children,
}: {
  title: string;
  unit?: string;
  controls?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="border-b border-line pb-1 last:border-b-0">
      <figcaption className="flex flex-col gap-1.5 px-3 pt-2.5 pb-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-fg-heading">
            {title}
            {unit && (
              <span className="ml-1 font-medium text-fg-subtle">({unit})</span>
            )}
          </span>
          {controls}
        </div>
        {legend}
      </figcaption>
      {children}
    </figure>
  );
}

export type KeyItem = { key: string; label: string; glyph: ReactNode };

/**
 * A chart's key, above its plot.
 *
 * Drawn here rather than by recharts' Legend, whose entries come from the
 * series: a whisker is not a series, and the percent chart's four categories
 * are one series coloured per bar.
 */
export function ChartKey({ items }: { items: readonly KeyItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-body">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          {item.glyph}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** When a chart has nothing to plot: said in its place, at a plot's height. */
export function EmptyPlot({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-[12px] text-fg-body">{children}</p>
  );
}

/**
 * A month on a chart's category axis, abbreviated as the table's head is —
 * and set heavier in the heading ink for the timeline's month, as the table's
 * head is.
 *
 * Inline style rather than attributes: the chart container colours every tick
 * by class, which would win over an attribute.
 */
export function MonthTick({
  x,
  y,
  payload,
  textAnchor,
  dy,
  current,
}: {
  x?: number;
  y?: number;
  payload?: { value: unknown };
  textAnchor?: "start" | "middle" | "end" | "inherit";
  /** Down from the tick point: under it on the x axis, level on the y. */
  dy: string;
  current: string | null;
}) {
  const value = String(payload?.value ?? "");
  const isCurrent = value === current;
  return (
    <text
      x={x}
      y={y}
      dy={dy}
      textAnchor={textAnchor}
      style={{
        fill: isCurrent ? INK : BODY,
        fontWeight: isCurrent ? 600 : 400,
      }}
    >
      {formatStepMonth(value)}
    </text>
  );
}

/**
 * One line of a tooltip: the mark's key, what it is, and its figure — the
 * figure in the table's mono face and ink, the rest in the body's.
 */
export function TooltipRow({
  glyph,
  label,
  value,
}: {
  glyph: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      {glyph}
      <span className="text-fg-body">{label}</span>
      <span className="ml-auto pl-3 font-cis-mono font-medium text-fg-heading">
        {value}
      </span>
    </div>
  );
}
