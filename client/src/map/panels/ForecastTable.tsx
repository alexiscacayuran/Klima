import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DetailRow, Figure } from "@/map/config/detailRows";
import { formatStepId, formatStepMonth } from "@/map/config/timeline";
import { inkOn } from "@/map/utils/ink";

const NO_VALUE = "—";

type Month = { id: string; date: string };

export type ForecastTableProps<M extends Month> = {
  /** The rows in sections, ruled off from one another (see DetailGroup). */
  sections: readonly (readonly DetailRow<M>[])[];
  /** The issuance's months, earliest first — one column each. */
  months: readonly M[];
  /** The timeline's step, whose column is lit and kept in view. */
  currentDate: string | null;
  /**
   * The horizontal position shared with the tables beside this one, so that
   * several read as one grid that scrolls together (see useScrollSync).
   */
  scrollSync?: ScrollSync;
  /** The table's outline: its variable's colour (see DetailGroup). */
  accent: string;
};

/**
 * Fixed rather than fitted to content, so that every table given the same
 * months is the same grid: the cards stack into one set of columns rather than
 * each sizing its own. Wide enough for the longest label ("Normal max (°C)"),
 * and for five characters of figure — "1250%", 35px in the mono face — inside
 * the cell's padding. Figures are four characters wide as a rule; the fifth is
 * a percent of normal past 999, which a dry month's small normal can produce.
 * A stack is only as wide as its widest figure: a range's ends are four
 * characters, and a tercile's "49% AN" is 37px with its tag set smaller.
 */
const LABEL_WIDTH = 136;
const MONTH_WIDTH = 64;

/**
 * One horizontal scroll position held by several viewports.
 *
 * `register` returns true when the viewport took on a position already set by
 * the others: that position is the reader's, and the table should not then
 * move it to show the current month.
 */
export type ScrollSync = {
  register: (viewport: HTMLElement) => {
    adopted: boolean;
    release: () => void;
  };
};

/**
 * A ScrollSync for a group of tables. The position outlives the tables — a
 * card closed and reopened comes back where the rest are — but not the owner.
 */
export function useScrollSync(): ScrollSync {
  const [sync] = useState<ScrollSync>(() => {
    const viewports = new Set<HTMLElement>();
    let left: number | null = null;

    return {
      register(viewport) {
        const adopted = left !== null;
        if (left !== null) viewport.scrollLeft = left;

        const onScroll = () => {
          // Reading the viewport's position now rather than trusting the
          // event: a follower's scroll event arrives after the leader has
          // moved on, and echoing its stale position back would make a
          // trackpad fling stutter.
          if (viewport.scrollLeft === left) return;
          left = viewport.scrollLeft;
          for (const other of viewports) {
            if (other !== viewport) other.scrollLeft = left;
          }
        };

        viewports.add(viewport);
        viewport.addEventListener("scroll", onScroll, { passive: true });
        return {
          adopted,
          release: () => {
            viewports.delete(viewport);
            viewport.removeEventListener("scroll", onScroll);
          },
        };
      },
    };
  });
  return sync;
}

/**
 * One variable of an issuance as a grid: months across, parameters down.
 *
 * Each variable gets a table of its own, month header and all (see
 * ForecastAccordion), so a card can be read — or collapsed — on its own.
 *
 * WeatherLab's shape, for the reason it works there: a forecast is read two
 * ways — one month across every parameter, and one parameter across the
 * months — and a grid is the one layout that serves both without a toggle.
 *
 * The month the timeline is on is lit, so the table and the map are visibly
 * describing the same moment, and it is scrolled into view when it changes:
 * scrubbing the timeline should never leave the reader's column off-screen
 * behind the labels.
 *
 * Columns are a fixed width and the horizontal position can be shared, so a
 * stack of these — one per variable — lines up and scrolls as one grid.
 *
 * Each section of rows is a body of its own — HTML's row group — with a rule
 * under it and none between its rows, so a forecast, its range and its normal
 * read as one block and the next quantity as the next.
 *
 * Hovering a row paints each of its figures the colour it is on the map, so a
 * row reads as a strip of the legend: where the month turns wet, how far above
 * normal. The text over each fill takes whichever ink reads on it.
 *
 * Scrolls sideways inside a ScrollArea rather than in the shadcn Table's own
 * `overflow-x-auto` container, which is made visible here: the themed bar is
 * the one the rest of the chrome uses, and the label column's `sticky` has to
 * resolve against the viewport, not an inner box that never scrolls.
 */
export function ForecastTable<M extends Month>({
  sections,
  months,
  currentDate,
  scrollSync,
  accent,
}: ForecastTableProps<M>) {
  const table = useRef<HTMLTableElement>(null);
  const currentHead = useRef<HTMLTableCellElement>(null);
  // Set when this table joined a group already scrolled somewhere, which is
  // then where it stays rather than jumping to the current month.
  const adopted = useRef(false);

  // Before the reveal below, which reads `adopted`: effects run in order.
  useLayoutEffect(() => {
    const viewport = table.current?.closest<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    if (!viewport || !scrollSync) return;
    const joined = scrollSync.register(viewport);
    adopted.current = joined.adopted;
    return joined.release;
  }, [scrollSync]);

  // Scrolled by hand rather than with scrollIntoView: the label column is
  // sticky over the left edge, so "nearest" would happily park the column
  // underneath it. Horizontal only — the panel's own vertical position is the
  // reader's, and a timeline tick is no reason to move it. The tables sharing
  // the position follow through the sync.
  useLayoutEffect(() => {
    if (adopted.current) {
      adopted.current = false;
      return;
    }
    const head = currentHead.current;
    const viewport = head?.closest<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    const label = viewport?.querySelector<HTMLElement>("[data-sticky-label]");
    if (!head || !viewport) return;

    const left = head.offsetLeft - (label?.offsetWidth ?? 0);
    const right = head.offsetLeft + head.offsetWidth - viewport.clientWidth;
    if (viewport.scrollLeft > left) viewport.scrollLeft = left;
    else if (viewport.scrollLeft < right) viewport.scrollLeft = right;
  }, [currentDate, months]);

  // Unpadded: the card's title bar is the table's heading and sits right on
  // it, and the table runs the card's full width, its edges in line with the
  // title's. The gap to the next card is the accordion's.
  return (
    <ScrollArea
      scrollbars="horizontal"
      // The bar starts where the months do: under the label column it would
      // offer to scroll something that never moves. Base UI pins it with an
      // inline inset, hence the `!`. And while there is overflow, the root
      // grows a strip for the bar below the last row instead of laying it
      // over the figures.
      style={
        {
          "--label-width": `${LABEL_WIDTH}px`,
          borderColor: accent,
        } as CSSProperties
      }
      className={cn(
        "[&_[data-slot=table-container]]:overflow-visible",
        // Outlined and rounded on the root, which clips the viewport (it
        // inherits the radius) and so the header band's corners with it.
        "overflow-hidden rounded-md border",
        "data-has-overflow-x:pb-2.5",
        "[&>[data-slot=scroll-area-scrollbar]]:start-(--label-width)!",
      )}
    >
      {/* `table-fixed`: the colgroup's widths are the columns', whatever the
          cells hold. Stretched past them only when the panel is wider than the
          grid, and then every table with these months stretches alike. */}
      <Table
        ref={table}
        style={{ width: LABEL_WIDTH + months.length * MONTH_WIDTH }}
        className="min-w-full table-fixed border-separate border-spacing-0 font-cis text-[12px]"
      >
        <colgroup>
          <col style={{ width: LABEL_WIDTH }} />
          {months.map((month) => (
            <col key={month.date} style={{ width: MONTH_WIDTH }} />
          ))}
        </colgroup>
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="hover:bg-transparent">
            <TableHead
              data-sticky-label
              className={cn(
                stickyCell,
                rule,
                "h-9 bg-well text-[12px] font-semibold text-fg-body",
              )}
            >
              {/* The card's title already names the variable above. */}
              <span className="sr-only">Parameter</span>
            </TableHead>
            {months.map((month) => {
              const current = month.date === currentDate;
              return (
                <TableHead
                  key={month.date}
                  ref={current ? currentHead : undefined}
                  title={formatStepId(month.date)}
                  aria-current={current ? "date" : undefined}
                  className={cn(
                    valueCell,
                    rule,
                    "h-9 bg-well text-[12px] font-semibold",
                    current
                      ? cn(currentColumn, "text-fg-heading")
                      : "text-fg-body",
                  )}
                >
                  {formatStepMonth(month.date)}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        {sections.map((section, index) => (
          // Keyed by position: the sections are fixed config, never
          // reordered.
          <TableBody key={index}>
            {section.map((row, rowIndex) => {
              // Under a section's last row — except the table's last, where
              // it would double the table's own border.
              const ruled =
                rowIndex === section.length - 1 && index < sections.length - 1;
              return (
                <TableRow key={row.key} className="hover:bg-transparent">
                  <TableCell
                    className={cn(
                      stickyCell,
                      ruled && rule,
                      "font-semibold text-fg-heading",
                    )}
                  >
                    {row.label}
                    {row.unit && (
                      <span className="ml-1 font-medium text-fg-subtle">
                        ({row.unit})
                      </span>
                    )}
                  </TableCell>
                  {months.map((month) => {
                    const cell = cellFor(row, month);
                    const current = month.date === currentDate;
                    return (
                      <TableCell
                        key={month.date}
                        style={
                          {
                            "--fill": cell?.fill,
                            "--ink": cell?.ink,
                          } as CSSProperties
                        }
                        className={cn(
                          valueCell,
                          ruled && rule,
                          "font-cis-mono",
                          current && currentColumn,
                          cell === null
                            ? "text-fg-subtle"
                            : current
                              ? "font-semibold text-fg-heading"
                              : "text-fg-body",
                          cell?.fill && revealFill,
                          cell?.ink && revealInk,
                          cell?.flush && "p-0",
                        )}
                      >
                        {cell?.content ?? NO_VALUE}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        ))}
      </Table>
    </ScrollArea>
  );
}

/** What a month's cell shows for a row, and how it colours on hover. */
type Cell = {
  content: ReactNode;
  /** The cell's fill while its row is hovered. */
  fill?: string;
  /** The text over `fill`, where one ink serves the whole cell. */
  ink?: string;
  /** Content that brings its own padding, so the cell drops its own. */
  flush?: boolean;
};

/**
 * A month's cell for a row, or null when the month has nothing to print.
 *
 * A stack sets its figures one over another rather than side by side: each
 * then lines up with the single figures in the rows around it, and the column
 * stays as narrow as one figure.
 */
function cellFor<M>(row: DetailRow<M>, month: M): Cell | null {
  if (row.kind === "value") {
    const figure = row.format(month);
    if (figure === null) return null;
    return {
      content: figure.text,
      fill: figure.fill,
      ink: figure.fill && inkOn(figure.fill),
    };
  }
  const figures = row.format(month);
  if (figures === null) return null;
  return {
    content: figures.map((figure, index) => (
      // Keyed by position: a stack's order is its meaning.
      <StackedFigure key={index} figure={figure} />
    )),
    flush: true,
  };
}

/**
 * One figure of a stack, as a band across its cell.
 *
 * The cell gives up its padding and the figures tile it, every one padded
 * alike, so the bands are all one height: on hover each fills with its own
 * colour and takes the ink for it — two ends of a range, or three outcomes —
 * and none reads as the lesser for being in the middle.
 */
function StackedFigure({ figure }: { figure: Figure }) {
  return (
    <span
      style={
        figure.fill
          ? ({
              "--fill": figure.fill,
              "--ink": inkOn(figure.fill),
            } as CSSProperties)
          : undefined
      }
      className={cn(
        "block px-3 py-1.5",
        figure.fill && [revealFill, revealInk],
      )}
    >
      {figure.label && <span className="sr-only">{figure.label} </span>}
      {figure.text}
      {/* Hidden from a screen reader, which has heard the name in full. */}
      {figure.tag && (
        <span
          aria-hidden
          className={cn(
            "ml-1 text-[10px] font-medium text-fg-subtle",
            figure.fill && revealInk,
          )}
        >
          {figure.tag}
        </span>
      )}
    </span>
  );
}

const cellBase = "px-3 py-2";

/**
 * Every cell draws its own bottom rule. The table is `border-separate` — a
 * collapsed border does not travel with a sticky cell, so the label column
 * would scroll out from under its own rules — and a row cannot carry a border
 * under that model.
 */
const rule = "border-b border-line";

/**
 * The label column, pinned over the months as they scroll. Solid, not the
 * panel's translucent fill: the figures sliding beneath it ghosted through the
 * last few percent, and a backdrop blur to hide them paints as a square layer
 * that the table's rounded corners do not clip.
 */
const stickyCell = cn(cellBase, "sticky left-0 z-10 bg-panel-solid text-left");

const valueCell = cn(cellBase, "text-right tabular-nums");

/**
 * A row's colours, shown while it is hovered and read from each cell's own
 * `--fill` and `--ink`.
 *
 * The fill is a layer of its own, laid over the cell's background and under
 * its text, rather than the background itself. So it covers the current
 * month's wash below instead of sitting under it — the wash would tint the
 * colour, and the ink was chosen against the colour untinted — and it fades by
 * opacity, which a background image cannot.
 *
 * Faded in and out rather than switched, because a row of saturated colour
 * snapping on is a flash, and running the pointer down the table strobes. A
 * hover crossed tens of times a sitting, so short and plain: 150 ms, the
 * panel's duration, on `ease`, the curve for a colour change. The ink fades
 * with it. Colour only, nothing moves, so reduced motion keeps it.
 *
 * A bare `tr:hover` rather than Tailwind's `hover:` / `group-hover:`, which
 * only apply under `@media (hover: hover)` — and a touchscreen laptop can
 * report `hover: none` while a mouse is in hand, which left the row blank.
 * On a phone a tap then lights the row, which is no worse.
 */
const revealFill = cn(
  // A stacking context, so the layer's negative z-index puts it above the
  // cell's background rather than behind it.
  "relative isolate",
  "before:absolute before:inset-0 before:-z-10 before:bg-(--fill)",
  "before:opacity-0 before:transition-opacity before:duration-150 before:ease-[ease]",
  "[tr:hover_&]:before:opacity-100",
);
const revealInk = cn(
  "transition-[color] duration-150 ease-[ease]",
  "[tr:hover_&]:text-(--ink)",
);

/**
 * The timeline's month, as a wash laid over a cell rather than a fill that
 * replaces it: a flat gradient is a background *image*, which paints on top of
 * the cell's own background colour. So the header keeps its band where the
 * column crosses it, and the two read as intersecting rather than the column
 * punching a hole in the header.
 */
const currentColumn = "bg-linear-to-r from-fg-subtle/30 to-fg-subtle/30";
