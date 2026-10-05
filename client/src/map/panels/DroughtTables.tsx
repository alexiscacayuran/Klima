import { useMemo } from "react";
import type { DroughtSeries } from "@/api/drought";
import type { PsgcLocation } from "@/api/locations";
import { DROUGHT_GROUPS } from "@/map/config/detailRows";
import { productIdFromKey } from "@/map/config/products";
import type { DroughtPlaceTable } from "@/map/hooks/useDroughtDetail";
import { useSelection } from "@/map/state/useSelection";
import { DroughtRegionDialog } from "./DroughtRegionDialog";
import { ForecastAccordion } from "./ForecastAccordion";
import { ForecastTable } from "./ForecastTable";

/** Each half's name, over its months. */
const TITLES: Record<DroughtSeries, string> = {
  assessment: "Assessment",
  outlook: "Outlook",
};

/**
 * Fitted to the words, on a tighter padding than the seasonal grid's 12px. The
 * longest status, "Dry condition", is 79px set semibold in the lit column; the
 * one label, "Status", 37px.
 */
const LABEL_WIDTH = 56;
const MONTH_WIDTH = 96;
const CELL_PADDING = 8;

/**
 * The Detail tab for drought: one card, always open, over one table of the
 * issuance's two halves side by side — the assessments, then the outlook —
 * each named in a row over the months.
 *
 * One table rather than two because the halves meet end to end: the outlook
 * opens the month after the current assessment, so the columns run as one
 * calendar and the timeline's step lights its column whichever layer is on.
 * With the step in neither, the table rests on the current assessment, where
 * the two halves meet.
 *
 * Under it, a way to the same table for every province of the place's region
 * (see DroughtRegionDialog) — absent for a place that is a region itself, as
 * NCR is in the province tier.
 */
export function DroughtTables({
  tables,
  region,
}: {
  tables: readonly DroughtPlaceTable[];
  /** The region the place is in, once the PSGC list has described it. */
  region: PsgcLocation | null;
}) {
  const { variable, date } = useSelection();
  // Memoised so the months keep their identity across renders: the table
  // scrolls its lit column into view whenever they change.
  const months = useMemo(
    () => tables.flatMap((table) => table.months),
    [tables],
  );
  const bands = useMemo(
    () =>
      tables
        // An empty window has no columns to span.
        .filter((table) => table.months.length > 0)
        .map((table) => ({
          label: TITLES[table.series],
          span: table.months.length,
        })),
    [tables],
  );
  const restingDate =
    tables.find((table) => table.series === "assessment")?.anchorDate ?? null;

  return (
    <ForecastAccordion
      groups={DROUGHT_GROUPS}
      // The rail product drought is listed under, for the card's icon: the
      // selected one, since this tab only shows while a drought layer is.
      productId={variable ? productIdFromKey(variable) : undefined}
      alwaysOpen
    >
      {(group) => (
        <>
          <ForecastTable
            sections={group.sections}
            months={months}
            bands={bands}
            currentDate={date}
            restingDate={restingDate}
            labelWidth={LABEL_WIDTH}
            monthWidth={MONTH_WIDTH}
            cellPadding={CELL_PADDING}
          />
          {region && (
            <DroughtRegionDialog
              region={region}
              months={months}
              bands={bands}
              currentDate={date}
              restingDate={restingDate}
              monthWidth={MONTH_WIDTH}
              cellPadding={CELL_PADDING}
            />
          )}
        </>
      )}
    </ForecastAccordion>
  );
}
