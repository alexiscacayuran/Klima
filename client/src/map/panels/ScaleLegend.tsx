import { useState } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { TooltipContent } from "@/components/ui/tooltip";
import { TERCILE_TAGS, TERCILES } from "@/map/config/colorScales";
import type {
  ColorScale,
  ScaleClass,
  SymbologyMode,
  Tercile,
} from "@/map/config/colorScales";
import { cn } from "@/lib/utils";
import { inkOn } from "@/map/utils/ink";

/** One cell of the bar, whichever mode drew it. */
type Cell = {
  key: string;
  /** What the cell prints: the value its range starts at (see cellsFor). */
  label: string;
  /** The colour under the label — what its ink is chosen against. */
  color: string;
  /** The class this cell *is*, in step mode; null along a ramp. */
  band: ScaleClass | null;
};

/**
 * A number as the cell prints it: one decimal at most, and none when it is
 * whole — "22.5" or "25", never "25.0".
 */
const formatValue = (value: number) => String(Number(value.toFixed(1)));

/**
 * The unit beside a figure. A percentage sign is set tight against its number
 * and every other unit is set apart, the same split SeasonalReading makes
 * between `suffix` and `unit`.
 */
const withUnit = (text: string, unit: string) =>
  unit === "%" ? `${text}%` : `${text} ${unit}`;

/**
 * The bar's cells, read off the table under the declared mode, each printed
 * with the value its range starts at — the way PAGASA's legends label their
 * edges: "<50" for the first class (it runs up from wherever the domain
 * floors), then "50", "100" … and "500+" for the open top.
 *
 * - **step**: one cell per class, flat in the class colour.
 * - **ramp**: one cell per stretch *between* breaks. The gradient behind them
 *   runs linearly between the two breaks that bound each cell.
 */
function cellsFor(scale: ColorScale, mode: SymbologyMode): Cell[] {
  if (mode === "step") {
    return scale.classes.map((band, index) => ({
      key: String(band.from),
      label:
        band.to === null
          ? `${formatValue(band.from)}+`
          : index === 0
            ? `<${formatValue(band.to)}`
            : formatValue(band.from),
      color: band.color,
      band,
    }));
  }

  return scale.breaks.slice(1).map((upper, index) => {
    const lower = scale.breaks[index];
    return {
      key: `${lower.value}-${upper.value}`,
      label:
        index === 0 ? `<${formatValue(upper.value)}` : formatValue(lower.value),
      // The colour mid-cell, which is where the label sits.
      color: scale.colorAt((lower.value + upper.value) / 2),
      band: null,
    };
  });
}

/**
 * The ramp as a CSS gradient, with the breaks spaced **evenly** along the bar.
 *
 * Not `scale.gradient()`, which spaces them by value — and whose note warns
 * against doing exactly this. That warning is about a bar read as one linear
 * axis. This one is not: it is cut into equal cells, each labelled with the value
 * it starts at, and within a cell the colour still runs linearly between the two
 * breaks that bound it. What each cell says is right; only the cells' widths
 * stop being proportional to their ranges, which is what lets 0–50 mm and
 * 400–500 mm both have room for a label in a bar of fixed width.
 *
 * Legacy hex stops, so the browser interpolates in sRGB — the same space chroma
 * and the raster palette use.
 */
const evenGradient = (scale: ColorScale) => {
  const last = scale.breaks.length - 1;
  return `linear-gradient(to right, ${scale.breaks
    .map((step, index) => `${step.color} ${((index / last) * 100).toFixed(2)}%`)
    .join(", ")})`;
};

/** One bar of a legend: the table it draws and what heads it. */
export type LegendRow = {
  key: string;
  /** Printed in the slot before the bar: a unit, or a short name. */
  label: string;
  scale: ColorScale;
};

/** What the shared tooltip is told about the cell under the pointer. */
type TooltipPayload = { band: ScaleClass; unit: string };

type MapLegendProps = {
  /** One bar per row, stacked top to bottom. */
  rows: readonly LegendRow[];
  /** How the values are applied — the layer's own declaration, not a choice. */
  mode: SymbologyMode;
  /** The whole legend, for a screen reader. */
  ariaLabel?: string;
  className?: string;
};

/**
 * The key to what the map is colouring: one or more bars with the numbers
 * printed inside, each headed by a short slot for its unit or name.
 *
 * **Fixed in width.** 320px whatever the table: the classes divide a bar
 * rather than grow it, so switching between a seven-class and a four-class
 * layer repaints the legend without moving the chrome around it. A single bar
 * is 36px tall; more rows stack upward from the same bottom edge.
 *
 * Cells are equal-width in both modes — see `evenGradient` for why that stays
 * honest along a ramp — so a layer's legend keeps its geometry if its mode is
 * ever changed. With several rows in step mode the cells share one column
 * grid, sized by the longest table, so a threshold sits at the same x in every
 * row and a shorter table draws a shorter bar — the near-normal tercile stops
 * at 50 under the other two's 50, as PAGASA's own legend draws it.
 *
 * In step mode each cell is a tooltip trigger naming the class's range and
 * what it means. One tooltip serves every cell through a detached handle, so
 * moving across the bars slides a single popup from class to class rather
 * than closing one and opening the next. Cells are list items, not buttons:
 * the ranges are also in each item as screen-reader text, so nothing is gained
 * by putting every stop in the tab order for a legend.
 */
export function MapLegend({
  rows,
  mode,
  ariaLabel = "Map legend",
  className,
}: MapLegendProps) {
  const [handle] = useState(() =>
    TooltipPrimitive.createHandle<TooltipPayload>(),
  );
  const stepped = mode === "step";
  const stacked = rows.length > 1;
  const columns = Math.max(
    ...rows.map((row) => cellsFor(row.scale, mode).length),
  );

  return (
    <figure
      aria-label={ariaLabel}
      className={cn(
        // The collapsed side panel's width, so the legend and the panels above
        // it share one column edge on the right of the map.
        "pointer-events-auto flex w-[360px] shrink-0 flex-col gap-1 p-2",
        "rounded-panel border border-line bg-panel-strong font-cis shadow-float backdrop-blur-md",
        className,
      )}
    >
      {rows.map((row) => {
        const cells = cellsFor(row.scale, mode);
        // The share of the grid this row fills. Only a stepped stack aligns
        // columns; a lone bar or a ramp always spans the full width. The px
        // terms account for the hairline gaps between cells.
        const width =
          stepped && stacked && cells.length < columns
            ? `calc((100% + 1px) * ${cells.length / columns} - 1px)`
            : "100%";

        return (
          <div
            key={row.key}
            className={cn("flex items-center gap-1.5", stacked ? "h-4" : "h-5")}
          >
            {/* A fixed slot, so "%" and "mm" — or AN, NN, BN — start every bar
                at the same x. */}
            <span className="w-8 shrink-0 text-center font-cis-mono text-[11px]/none font-medium text-fg-body">
              {row.label}
            </span>

            <div className="relative h-full min-w-0 flex-1">
              <div className="relative h-full" style={{ width }}>
                <ol
                  className={cn(
                    "flex size-full overflow-hidden rounded-full",
                    // Hairlines of panel between classes, so adjacent bands
                    // with close colours still read as separate steps. A ramp
                    // has no seams.
                    stepped && "gap-px",
                  )}
                  style={
                    stepped
                      ? undefined
                      : { backgroundImage: evenGradient(row.scale) }
                  }
                >
                  {cells.map((cell) => {
                    const content = (
                      <>
                        <span aria-hidden>{cell.label}</span>
                        <span className="sr-only">
                          {cell.band
                            ? cell.band.label
                              ? `${withUnit(cell.band.range, row.scale.unit)}: ${cell.band.label}`
                              : withUnit(cell.band.range, row.scale.unit)
                            : withUnit(cell.label, row.scale.unit)}
                        </span>
                      </>
                    );
                    const cellClass = cn(
                      "flex min-w-0 flex-1 cursor-default items-center justify-center overflow-hidden font-cis-mono font-semibold tracking-tight whitespace-nowrap",
                      stacked ? "text-[10px]/none" : "text-[11px]/none",
                    );

                    return cell.band ? (
                      <TooltipPrimitive.Trigger
                        key={cell.key}
                        handle={handle}
                        payload={{ band: cell.band, unit: row.scale.unit }}
                        render={<li />}
                        className={cellClass}
                        style={{
                          backgroundColor: cell.color,
                          color: inkOn(cell.color),
                        }}
                      >
                        {content}
                      </TooltipPrimitive.Trigger>
                    ) : (
                      <li
                        key={cell.key}
                        className={cellClass}
                        style={{ color: inkOn(cell.color) }}
                      >
                        {content}
                      </li>
                    );
                  })}
                </ol>
                {/* An edge for the bar, laid over the cells rather than on the
                    list: an inset ring on the list would be painted over by the
                    cells' own fills. Needed at the pale end, where #e1e1e1
                    meets a white panel. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-fg-heading/10 ring-inset"
                />
              </div>
            </div>
          </div>
        );
      })}

      {stepped && (
        <TooltipPrimitive.Root handle={handle}>
          {({ payload }) =>
            payload && (
              <TooltipContent className="font-cis">
                <span className="font-cis-mono font-semibold">
                  {withUnit(payload.band.range, payload.unit)}
                </span>
                {payload.band.label && (
                  <span className="opacity-70">{payload.band.label}</span>
                )}
              </TooltipContent>
            )
          }
        </TooltipPrimitive.Root>
      )}
    </figure>
  );
}

type ScaleLegendProps = {
  /** The table the surface — or the station pills — are painted from. */
  scale: ColorScale;
  /** How it is applied — the layer's own declaration, not a choice. */
  mode: SymbologyMode;
  className?: string;
};

/**
 * One table as one bar, headed by its unit: the key to the raster on screen,
 * or to the station pills of a layer that has no raster (temperature).
 */
export function ScaleLegend({ scale, mode, className }: ScaleLegendProps) {
  return (
    <MapLegend
      rows={[{ key: "scale", label: scale.unit, scale }]}
      mode={mode}
      className={className}
    />
  );
}

type TercileLegendProps = {
  scales: Record<Tercile, ColorScale>;
  className?: string;
};

/**
 * The key to the tercile station pills: one bar per outcome, above normal on
 * top, in the order the pill's strip stacks them. Each band is a confidence in
 * its row's outcome, which is what the tooltips say; the unit is there too.
 */
export function TercileLegend({ scales, className }: TercileLegendProps) {
  return (
    <MapLegend
      rows={TERCILES.map((tercile) => ({
        key: tercile,
        label: TERCILE_TAGS[tercile],
        scale: scales[tercile],
      }))}
      mode="step"
      ariaLabel="Tercile probability legend (%)"
      className={className}
    />
  );
}
