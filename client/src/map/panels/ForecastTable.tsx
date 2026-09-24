import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
import type { DetailRow } from "@/map/config/detailRows";
import { formatStepId, formatStepMonth } from "@/map/config/timeline";

const NO_VALUE = "—";

type Month = { id: string; date: string };

export type ForecastTableProps<M extends Month> = {
  rows: readonly DetailRow<M>[];
  /** The issuance's months, earliest first — one column each. */
  months: readonly M[];
  /** The timeline's step, whose column is lit and kept in view. */
  currentDate: string | null;
  /**
   * The horizontal position shared with the tables beside this one, so that
   * several read as one grid that scrolls together (see useScrollSync).
   */
  scrollSync?: ScrollSync;
};

/**
 * Fixed rather than fitted to content, so that every table given the same
 * months is the same grid: the cards stack into one set of columns rather than
 * each sizing its own. Wide enough for the longest label ("Normal max (°C)")
 * and the widest value (a range, "32.3–37.0").
 */
const LABEL_WIDTH = 136;
const MONTH_WIDTH = 92;

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
 * Scrolls sideways inside a ScrollArea rather than in the shadcn Table's own
 * `overflow-x-auto` container, which is made visible here: the themed bar is
 * the one the rest of the chrome uses, and the label column's `sticky` has to
 * resolve against the viewport, not an inner box that never scrolls.
 */
export function ForecastTable<M extends Month>({
  rows,
  months,
  currentDate,
  scrollSync,
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

  return (
    // Padded outside the scroll area rather than inside it: a sticky cell pins
    // to the scrollport's edge, padding or not, so padding the viewport would
    // leave the label column sliding into the gutter.
    <div className="p-2.5">
      <ScrollArea
        scrollbars="horizontal"
        // The bar starts where the months do: under the label column it would
        // offer to scroll something that never moves. Base UI pins it with an
        // inline inset, hence the `!`. And while there is overflow, the root
        // grows a strip for the bar below the last row instead of laying it
        // over the figures.
        style={{ "--label-width": `${LABEL_WIDTH}px` } as CSSProperties}
        className={cn(
          "[&_[data-slot=table-container]]:overflow-visible",
          // Rounded on the root, which clips the viewport (it inherits the
          // radius) and so the header band's corners with it.
          "overflow-hidden rounded-md",
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

          {/* The last row's rule would double the card's own border. */}
          <TableBody className="[&_tr:last-child_td]:border-b-0">
            {rows.map((row) => (
              <TableRow key={row.key} className="hover:bg-transparent">
                <TableCell
                  className={cn(stickyCell, "font-semibold text-fg-heading")}
                >
                  {row.label}
                  {row.unit && (
                    <span className="ml-1 font-medium text-fg-subtle">
                      ({row.unit})
                    </span>
                  )}
                </TableCell>
                {months.map((month) => {
                  const text = row.format(month);
                  const current = month.date === currentDate;
                  return (
                    <TableCell
                      key={month.date}
                      className={cn(
                        valueCell,
                        "font-cis-mono",
                        current && currentColumn,
                        text === null
                          ? "text-fg-subtle"
                          : current
                            ? "font-semibold text-fg-heading"
                            : "text-fg-body",
                      )}
                    >
                      {text ?? NO_VALUE}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

/**
 * Every cell draws its own bottom rule. The table is `border-separate` — a
 * collapsed border does not travel with a sticky cell, so the label column
 * would scroll out from under its own rules — and a row cannot carry a border
 * under that model.
 */
const cellBase = "border-b border-line px-3 py-2";

/**
 * The label column, pinned over the months as they scroll. Solid, not the
 * panel's translucent fill: the figures sliding beneath it ghosted through the
 * last few percent, and a backdrop blur to hide them paints as a square layer
 * that the table's rounded corners do not clip.
 */
const stickyCell = cn(
  cellBase,
  "sticky left-0 z-10 bg-panel-solid text-left",
);

const valueCell = cn(cellBase, "text-right tabular-nums");

/**
 * The timeline's month, as a wash laid over a cell rather than a fill that
 * replaces it: a flat gradient is a background *image*, which paints on top of
 * the cell's own background colour. So the header keeps its band where the
 * column crosses it, and the two read as intersecting rather than the column
 * punching a hole in the header.
 */
const currentColumn = "bg-linear-to-r from-fg-subtle/30 to-fg-subtle/30";
