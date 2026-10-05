import { useMemo } from "react";
import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import type { PsgcLocation } from "@/api/locations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { droughtProvinceRow } from "@/map/config/detailRows";
import type { DroughtPlaceMonth } from "@/map/config/detailRows";
import { usePlaceProfile } from "@/map/hooks/usePlaceProfile";
import { ForecastTable } from "./ForecastTable";
import type { Band } from "./ForecastTable";

/**
 * Wide enough for the longest province name, "Maguindanao del Norte" — 140px
 * set semibold — inside the drought grid's padding.
 */
const LABEL_WIDTH = 160;

/** The dialog's own padding either side, and its border's. */
const FRAME = 2 * 16 + 2;

type DroughtRegionDialogProps = {
  region: PsgcLocation;
  /** The place's own table's columns, so the two read month for month. */
  months: readonly DroughtPlaceMonth[];
  bands: readonly Band[];
  currentDate: string | null;
  restingDate: string | null;
  monthWidth: number;
  cellPadding: number;
};

/**
 * Every province of the place's region in one table, behind a line under the
 * place's own: secondary to the place, so asked for rather than shown.
 *
 * The same grid as the card's — the same months, halves and colours — with a
 * row per province, named down the first column. Centred over the map, as wide
 * as the grid where the window allows, and scrolled where it does not.
 */
export function DroughtRegionDialog({
  region,
  months,
  bands,
  currentDate,
  restingDate,
  monthWidth,
  cellPadding,
}: DroughtRegionDialogProps) {
  const width = LABEL_WIDTH + months.length * monthWidth + FRAME;

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "mt-1.5 flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-field px-2.5 py-1.5",
          "text-left text-[12px]/4 font-medium text-fg-body outline-none",
          "decoration-transparent decoration-1 underline-offset-4 underline",
          "transition-colors duration-150 hover:text-fg-heading hover:decoration-current",
          "focus-visible:ring-3 focus-visible:ring-brand/50",
        )}
      >
        View status of provinces in {region.name}
        <ChevronRight aria-hidden className="size-4 shrink-0" />
      </DialogTrigger>
      <DialogContent
        style={{ "--dialog-width": `${width}px` } as CSSProperties}
        className={cn(
          "w-(--dialog-width) sm:max-w-[calc(100%-2rem)]",
          "rounded-panel border border-line bg-panel-solid font-cis text-fg-body shadow-panel ring-0",
        )}
      >
        <DialogHeader className="gap-1 pr-8">
          <DialogDescription className="text-[12px] text-fg-subtle">
            Drought assessment and outlook
          </DialogDescription>
          <DialogTitle className="text-sm font-semibold text-fg-heading">
            {region.name}
          </DialogTitle>
        </DialogHeader>
        <RegionTable
          region={region}
          months={months}
          bands={bands}
          currentDate={currentDate}
          restingDate={restingDate}
          monthWidth={monthWidth}
          cellPadding={cellPadding}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The region's provinces, each a section of its own so every row is ruled off
 * from the next. Read from the PSGC list the panel has already fetched to
 * describe the place, so it is there on opening.
 */
function RegionTable({ region, ...table }: DroughtRegionDialogProps) {
  const profile = usePlaceProfile(region.psgc);
  const sections = useMemo(
    () =>
      profile.status === "ready"
        ? profile.data.provinces.map(({ province }) => [
            droughtProvinceRow(province.psgc, province.name),
          ])
        : [],
    [profile],
  );

  if (profile.status === "loading" || profile.status === "idle") {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading provinces…</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full rounded-sm bg-line" />
        ))}
      </div>
    );
  }
  if (sections.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-fg-body">
        {profile.status === "error"
          ? "Provinces unavailable."
          : "No provinces listed for this region."}
      </p>
    );
  }
  return (
    <ForecastTable {...table} sections={sections} labelWidth={LABEL_WIDTH} />
  );
}
