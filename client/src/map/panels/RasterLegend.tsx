import { useState } from "react";
import chroma from "chroma-js";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { TooltipContent } from "@/components/ui/tooltip";
import type {
  ColorScale,
  ScaleClass,
  SymbologyMode,
} from "@/map/config/colorScales";
import { cn } from "@/lib/utils";

type RasterLegendProps = {
  /** The table the surface is painted from. */
  scale: ColorScale;
  /** How the surface applies it — the variant's own declaration, not a choice. */
  mode: SymbologyMode;
  className?: string;
};

/** One cell of the bar, whichever mode drew it. */
type Cell = {
  key: string;
  /** The number printed in the cell: the midpoint of the stretch it spans. */
  label: string;
  /** The colour under the label — what its ink is chosen against. */
  color: string;
  /** The class this cell *is*, in step mode; null along a ramp. */
  band: ScaleClass | null;
};

/**
 * The two inks a label can take. Fixed rather than theme tokens: they are read
 * against the data colours, which do not change with the theme.
 */
const INK_LIGHT = "#ffffff";
const INK_DARK = "#09090b";

/**
 * Whichever ink contrasts more with the cell.
 *
 * Chosen per cell rather than one ink with a halo: the tables run from
 * near-white through yellow to pure black, so no single ink reads on all of
 * them, and a text shadow legible on #e1e1e1 is a smudge on #002573.
 */
const inkOn = (color: string) =>
  chroma.contrast(color, INK_LIGHT) >= chroma.contrast(color, INK_DARK)
    ? INK_LIGHT
    : INK_DARK;

/**
 * A number as the cell prints it: one decimal at most, and none when it is
 * whole — a midpoint of 0–75 is "37.5", of 0–50 is "25", never "25.0".
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
 * The bar's cells, read off the table under the declared mode.
 *
 * - **step**: one cell per class, flat in the class colour. The open-topped
 *   last class has no midpoint, so it prints its lower bound as "500+".
 * - **ramp**: one cell per stretch *between* breaks, labelled with that
 *   stretch's midpoint. The gradient behind them runs linearly between the two
 *   breaks, so the colour under each label is exactly `colorAt` of the number
 *   it prints.
 */
function cellsFor(scale: ColorScale, mode: SymbologyMode): Cell[] {
  if (mode === "step") {
    return scale.classes.map((band) => ({
      key: String(band.from),
      label:
        band.to === null
          ? `${formatValue(band.from)}+`
          : formatValue((band.from + band.to) / 2),
      color: band.color,
      band,
    }));
  }

  return scale.breaks.slice(1).map((upper, index) => {
    const lower = scale.breaks[index];
    const midpoint = (lower.value + upper.value) / 2;
    return {
      key: `${lower.value}-${upper.value}`,
      label: formatValue(midpoint),
      color: scale.colorAt(midpoint),
      band: null,
    };
  });
}

/**
 * The ramp as a CSS gradient, with the breaks spaced **evenly** along the bar.
 *
 * Not `scale.gradient()`, which spaces them by value — and whose note warns
 * against doing exactly this. That warning is about a bar read as one linear
 * axis. This one is not: it is cut into equal cells, each labelled with its own
 * midpoint, and within a cell the colour still runs linearly between the two
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

/**
 * The key to the raster on screen: its unit, and its colours as a bar with the
 * numbers printed inside.
 *
 * **Fixed in size.** 320 × 36 whatever the table: the classes divide the bar
 * rather than grow it, so switching between a seven-class and a four-class
 * layer repaints the legend without moving the chrome around it. Seven is the
 * most any table has today, at roughly 38px a cell; a table much longer than
 * that would need a wider bar, not a scrolling one.
 *
 * Cells are equal-width in both modes — see `evenGradient` for why that stays
 * honest along a ramp — so a layer's legend keeps its geometry if its variant's
 * mode is ever changed.
 *
 * In step mode each cell is a tooltip trigger naming the class's range and
 * what it means. One tooltip serves every cell through a detached handle, so
 * moving along the bar slides a single popup from class to class rather than
 * closing one and opening the next. Cells are list items, not buttons: the
 * ranges are also in each item as screen-reader text, so nothing is gained by
 * putting seven stops in the tab order for a legend.
 */
export function RasterLegend({ scale, mode, className }: RasterLegendProps) {
  const [handle] = useState(() => TooltipPrimitive.createHandle<ScaleClass>());
  const cells = cellsFor(scale, mode);
  const stepped = mode === "step";

  return (
    <figure
      aria-label="Map legend"
      className={cn(
        "pointer-events-auto flex h-9 w-80 shrink-0 items-center gap-1.5 p-2",
        "rounded-panel border border-line bg-panel-strong font-cis shadow-float backdrop-blur-md",
        className,
      )}
    >
      {/* A fixed slot, so "%" and "mm" start the bar at the same x. */}
      <span className="w-8 shrink-0 text-center font-cis-mono text-[11px]/none font-medium text-fg-body">
        {scale.unit}
      </span>

      <div className="relative h-full min-w-0 flex-1">
        <ol
          className={cn(
            "flex size-full overflow-hidden rounded-full",
            // Hairlines of panel between classes, so adjacent bands with close
            // colours still read as separate steps. A ramp has no seams.
            stepped && "gap-px",
          )}
          style={stepped ? undefined : { backgroundImage: evenGradient(scale) }}
        >
          {cells.map((cell) => {
            const content = (
              <>
                <span aria-hidden>{cell.label}</span>
                <span className="sr-only">
                  {cell.band
                    ? cell.band.label
                      ? `${withUnit(cell.band.range, scale.unit)}: ${cell.band.label}`
                      : withUnit(cell.band.range, scale.unit)
                    : withUnit(cell.label, scale.unit)}
                </span>
              </>
            );
            const cellClass =
              "flex min-w-0 flex-1 cursor-default items-center justify-center overflow-hidden font-cis-mono text-[11px]/none font-semibold tracking-tight whitespace-nowrap";

            return cell.band ? (
              <TooltipPrimitive.Trigger
                key={cell.key}
                handle={handle}
                payload={cell.band}
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
        {/* An edge for the bar, laid over the cells rather than on the list: an
            inset ring on the list would be painted over by the cells' own
            fills. Needed at the pale end, where #e1e1e1 meets a white panel. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-fg-heading/10 ring-inset"
        />
      </div>

      {stepped && (
        <TooltipPrimitive.Root handle={handle}>
          {({ payload }) =>
            payload && (
              <TooltipContent className="font-cis">
                <span className="font-cis-mono font-semibold">
                  {withUnit(payload.range, scale.unit)}
                </span>
                {payload.label && (
                  <span className="opacity-70">{payload.label}</span>
                )}
              </TooltipContent>
            )
          }
        </TooltipPrimitive.Root>
      )}
    </figure>
  );
}
