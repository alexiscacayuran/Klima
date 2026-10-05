import { useLayoutEffect, useRef } from "react";
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
import type { DetailGroup, DetailRow, Figure } from "@/map/config/detailRows";
import { formatStepId, formatStepMonth } from "@/map/config/timeline";
import { useSelection } from "@/map/state/useSelection";
import { inkOn } from "@/map/utils/ink";
import { ForecastAccordion } from "./ForecastAccordion";
import { useDragScroll } from "./useDragScroll";
import { useScrollSync } from "./useScrollSync";
import type { ScrollSync } from "./useScrollSync";

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
   * The column kept in view while the timeline's step is not one of these
   * months, so the table still opens somewhere meaningful.
   */
  restingDate?: string | null;
  /**
   * Names for runs of months, in a row over the month header — for a table
   * whose columns join series end to end. In order, each spanning as many
   * columns as it names. Absent, there is no such row.
   */
  bands?: readonly Band[];
  /** Column widths, for rows that are not figures (see LABEL_WIDTH). */
  labelWidth?: number;
  monthWidth?: number;
  /** Each cell's padding either side, in px — less, for a tighter grid. */
  cellPadding?: number;
  /**
   * The horizontal position shared with the tables beside this one, so that
   * several read as one grid that scrolls together (see ScrollSync). Absent,
   * the table keeps one of its own.
   */
  scrollSync?: ScrollSync;
};

/** A run of adjacent months named as one, such as a series' window. */
export type Band = { label: string; span: number };

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
const CELL_PADDING = 12;

/**
 * The Table tab: an issuance as one card per variable (see ForecastAccordion),
 * each over its own table.
 *
 * The open cards are one grid: the same columns, scrolled sideways together,
 * and a card opened later joins at the position the others are already at. The
 * position is held out here, above the accordion, so it outlives the cards
 * resetting when the rail's variable changes.
 */
export function ForecastTables<M extends Month>({
  groups,
  months,
}: {
  groups: readonly DetailGroup<M>[];
  /** The issuance's months, earliest first — every card's columns. */
  months: readonly M[];
}) {
  const { date } = useSelection();
  const scrollSync = useScrollSync();

  return (
    <ForecastAccordion groups={groups}>
      {(group) => (
        <ForecastTable
          sections={group.sections}
          months={months}
          currentDate={date}
          scrollSync={scrollSync}
        />
      )}
    </ForecastAccordion>
  );
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
 * The row a variable is read for (see DetailRow) is painted, each figure the
 * colour it is on the map, so it reads as a strip of the legend: where the
 * month turns wet, how far above normal. The text over each fill takes
 * whichever ink reads on it.
 *
 * Scrolls sideways inside a ScrollArea rather than in the shadcn Table's own
 * `overflow-x-auto` container, which is made visible here: the themed bar is
 * the one the rest of the chrome uses, and the label column's `sticky` has to
 * resolve against the viewport, not an inner box that never scrolls. It also
 * scrolls by dragging with the mouse (see useDragScroll), glides on when
 * flicked, and stretches and bounces back past either end (see ScrollSync).
 */
export function ForecastTable<M extends Month>({
  sections,
  months,
  currentDate,
  restingDate = null,
  bands,
  labelWidth = LABEL_WIDTH,
  monthWidth = MONTH_WIDTH,
  cellPadding = CELL_PADDING,
  scrollSync,
}: ForecastTableProps<M>) {
  const table = useRef<HTMLTableElement>(null);
  const revealHead = useRef<HTMLTableCellElement>(null);
  // The column kept in view: the lit one, or where the table rests without.
  const revealDate = months.some((month) => month.date === currentDate)
    ? currentDate
    : restingDate;
  // Set when this table joined a group already scrolled somewhere, which is
  // then where it stays rather than jumping to the current month.
  const adopted = useRef(false);
  const ownSync = useScrollSync();
  const sync = scrollSync ?? ownSync;

  // Before the reveal below, which reads `adopted`: effects run in order.
  useLayoutEffect(() => {
    const viewport = table.current?.closest<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    if (!viewport) return;
    const joined = sync.register(viewport);
    adopted.current = joined.adopted;
    return joined.release;
  }, [sync]);

  useDragScroll(table, sync);

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
    const head = revealHead.current;
    const viewport = head?.closest<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    const label = viewport?.querySelector<HTMLElement>("[data-sticky-label]");
    if (!head || !viewport) return;

    const left = head.offsetLeft - (label?.offsetWidth ?? 0);
    const right = head.offsetLeft + head.offsetWidth - viewport.clientWidth;
    if (viewport.scrollLeft > left) viewport.scrollLeft = left;
    else if (viewport.scrollLeft < right) viewport.scrollLeft = right;
  }, [revealDate, months]);

  // Blank: the card's title already names the variable above. Opens the
  // header's first row, and runs down through the months' when the bands sit
  // over them, so the corner stays one block.
  const corner = (
    <TableHead
      data-sticky-label
      rowSpan={bands ? 2 : undefined}
      className={cn(
        stickyCell,
        rule,
        "h-9 bg-well text-[12px] font-semibold text-fg-body",
      )}
    >
      <span className="sr-only">Parameter</span>
    </TableHead>
  );

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
          "--label-width": `${labelWidth}px`,
          "--cell-x": `${cellPadding}px`,
        } as CSSProperties
      }
      className={cn(
        "[&_[data-slot=table-container]]:overflow-visible",
        // Rounded on the root, which clips the viewport (it inherits the
        // radius) and so the header band's corners with it.
        "overflow-hidden rounded-md",
        "data-has-overflow-x:pb-2.5",
        "[&>[data-slot=scroll-area-scrollbar]]:start-(--label-width)!",
        // Draggable while there is somewhere to drag to (see useDragScroll).
        "[&>[data-slot=scroll-area-viewport][data-has-overflow-x]]:cursor-grab",
        "[&>[data-slot=scroll-area-viewport][data-has-overflow-x][data-dragging]]:cursor-grabbing",
        // A swipe past an end stays here, rather than going back a page. With
        // a mouse or trackpad the bounce is ScrollSync's own, so the browser's
        // is turned off rather than doubled; a finger keeps the native one.
        "[&>[data-slot=scroll-area-viewport]]:overscroll-x-contain",
        "pointer-fine:[&>[data-slot=scroll-area-viewport]]:overscroll-x-none",
      )}
    >
      {/* `table-fixed`: the colgroup's widths are the columns', whatever the
          cells hold. Stretched past them only when the panel is wider than the
          grid, and then every table with these months stretches alike. */}
      <Table
        ref={table}
        style={{ width: labelWidth + months.length * monthWidth }}
        className="min-w-full table-fixed border-separate border-spacing-0 font-cis text-[12px]"
      >
        <colgroup>
          <col style={{ width: labelWidth }} />
          {months.map((month) => (
            <col key={month.date} style={{ width: monthWidth }} />
          ))}
        </colgroup>
        <TableHeader className="[&_tr]:border-0">
          {bands && (
            <TableRow className="hover:bg-transparent">
              {corner}
              {bands.map((band, index) => (
                <TableHead
                  key={band.label}
                  colSpan={band.span}
                  className={cn(
                    cellBase,
                    rule,
                    "h-8 bg-well text-[12px] font-semibold text-fg-body",
                    // Where one run ends and the next begins.
                    index > 0 && "border-l",
                  )}
                >
                  {/* Pinned just past the label column while its run scrolls
                      beneath, rather than centred over the run: a run is wider
                      than the panel, and its middle is often out of view. */}
                  <span className="sticky left-[calc(var(--label-width)+var(--cell-x))] inline-block">
                    {band.label}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          )}
          <TableRow className="hover:bg-transparent">
            {!bands && corner}
            {months.map((month) => {
              const current = month.date === currentDate;
              return (
                <TableHead
                  key={month.date}
                  ref={month.date === revealDate ? revealHead : undefined}
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
              // Under a section's last row — except the table's last, which
              // the card's own end closes.
              const ruled =
                rowIndex === section.length - 1 && index < sections.length - 1;
              return (
                <TableRow key={row.key} className="hover:bg-transparent">
                  <TableCell
                    data-sticky-label
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
                          !row.named && "font-cis-mono",
                          current && currentColumn,
                          cell === null
                            ? "text-fg-subtle"
                            : current
                              ? "font-semibold text-fg-heading"
                              : "text-fg-body",
                          cell?.fill && paintFill,
                          cell?.ink && paintInk,
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

/** What a month's cell shows for a row, and the colour it is painted. */
type Cell = {
  content: ReactNode;
  /** The cell's fill, on a highlighted row. */
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
 * alike, so the bands are all one height: a coloured figure fills its band
 * edge to edge and takes the ink for it — the likeliest of three outcomes —
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
        "block px-(--cell-x) py-1.5",
        figure.fill && [paintFill, paintInk],
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
            figure.fill && paintInk,
          )}
        >
          {figure.tag}
        </span>
      )}
    </span>
  );
}

const cellBase = "px-(--cell-x) py-2";

/**
 * Every cell draws its own bottom rule. The table is `border-separate` — a
 * collapsed border does not travel with a sticky cell, so the label column
 * would scroll out from under its own rules — and a row cannot carry a border
 * under that model.
 */
const rule = "border-b border-line";

/**
 * The label column, pinned over the months as they scroll — and held back as
 * they stretch past an end (see ScrollSync), so its cells carry
 * `data-sticky-label`. Solid, not the
 * panel's translucent fill: the figures sliding beneath it ghosted through the
 * last few percent, and a backdrop blur to hide them paints as a square layer
 * that the table's rounded corners do not clip.
 */
const stickyCell = cn(cellBase, "sticky left-0 z-10 bg-panel-solid text-left");

const valueCell = cn(cellBase, "text-center tabular-nums");

/**
 * A highlighted cell's colours, read from its own `--fill` and `--ink`.
 *
 * The fill is a layer of its own, laid over the cell's background and under
 * its text, rather than the background itself. So it covers the current
 * month's wash below instead of sitting under it — the wash would tint the
 * colour, and the ink was chosen against the colour untinted.
 *
 * The ink comes after the cell's own text colour in the class list, which
 * `cn` resolves in its favour.
 */
const paintFill = cn(
  // A stacking context, so the layer's negative z-index puts it above the
  // cell's background rather than behind it.
  "relative isolate",
  "before:absolute before:inset-0 before:-z-10 before:bg-(--fill)",
);
const paintInk = "text-(--ink)";

/**
 * The timeline's month, as a wash laid over a cell rather than a fill that
 * replaces it: a flat gradient is a background *image*, which paints on top of
 * the cell's own background colour. So the header keeps its band where the
 * column crosses it, and the two read as intersecting rather than the column
 * punching a hole in the header.
 */
const currentColumn = "bg-linear-to-r from-fg-subtle/30 to-fg-subtle/30";
