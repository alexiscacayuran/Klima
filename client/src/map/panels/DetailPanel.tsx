import type { ReactNode } from "react";
import { ChartLine, Info, Maximize2, Minimize2, Table, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PROVINCE_GROUPS, STATION_GROUPS } from "@/map/config/detailRows";
import { useSeasonalForecast } from "@/map/hooks/useSeasonalForecast";
import { useSeasonalStations } from "@/map/hooks/useSeasonalStations";
import { useStationMeta } from "@/map/hooks/useStationMeta";
import { useSidePanels } from "@/map/state/useSidePanels";
import { useSelection } from "@/map/state/useSelection";
import { ForecastAccordion } from "./ForecastAccordion";
import { PanelIconButton, SidePanel } from "./SidePanel";

export type DetailPanelProps = {
  /** Placement and height cap from the dock; the frame sizes its own width. */
  className?: string;
};

/**
 * The detail panel: the whole issuance for whatever the user last opened.
 *
 * The subject is the selection's — `pinned` or `station`, which the provider
 * keeps exclusive — so this only has to pick a renderer. Each reads the same
 * hook the thing that opened it reads (the popup, the pill), so the table and
 * the card on the map cannot be quoting different fetches.
 *
 * Closing it leaves the slot empty and hands the pin back its popup; it does
 * not deselect anything, and does not reopen the overview (see
 * SidePanelsState.closeDetail).
 *
 * It opens at the column width the rail is drawn to and expands to half the
 * viewport, which is the width the station table needs to show a whole
 * issuance without scrolling.
 *
 * The header carries tabs in place of a title — Table, Chart, About — with
 * the subject's name above whichever is showing. The tab outlives a change of
 * subject: someone reading charts goes on reading charts from one station to
 * the next.
 */
export function DetailPanel({ className }: DetailPanelProps) {
  const { pinned, station } = useSelection();
  const { closeDetail, detailExpanded, toggleDetailExpanded } = useSidePanels();

  return (
    // `contents`: the root has to enclose both the tab list in the header and
    // the panels in the body, but the frame is what the dock lays out, so the
    // root must not become a box of its own around it.
    <Tabs defaultValue="table" className="contents">
      <SidePanel
        title="Detail"
        heading={
          <TabsList variant="line">
            <TabsTrigger value="table">
              <Table aria-hidden />
              Table
            </TabsTrigger>
            <TabsTrigger value="chart">
              <ChartLine aria-hidden />
              Chart
            </TabsTrigger>
            <TabsTrigger value="about">
              <Info aria-hidden />
              About
            </TabsTrigger>
          </TabsList>
        }
        className={cn(
          // Widens leftwards from the dock's right edge, which is why the dock
          // right-aligns its slot rather than fixing its width. Half the
          // viewport, but never so far that it reaches the product rail on the
          // other side: 22rem holds back the rail, both gutters and a gap.
          detailExpanded ? "w-[50vw] max-w-[calc(100vw-22rem)]" : "w-[360px]",
          className,
        )}
        actions={
          <>
            {/* lucide's `maximize-2` / `minimize-2` — the arrows named
              up-right-and-down-left-from-center and
              down-left-and-up-right-to-center. */}
            <PanelIconButton
              label={detailExpanded ? "Collapse panel" : "Expand panel"}
              onClick={toggleDetailExpanded}
            >
              {detailExpanded ? (
                <Minimize2 aria-hidden />
              ) : (
                <Maximize2 aria-hidden />
              )}
            </PanelIconButton>
            <PanelIconButton label="Close detail" onClick={closeDetail}>
              <X aria-hidden />
            </PanelIconButton>
          </>
        }
      >
        {station !== null ? (
          <StationDetail stationId={station} />
        ) : pinned ? (
          <PlaceDetail name={pinned.name} />
        ) : (
          // Unreachable while the provider keeps the panel shut without a
          // subject; said plainly rather than rendering nothing, in case it is.
          <Notice>Select a place or a station on the map.</Notice>
        )}
      </SidePanel>
    </Tabs>
  );
}

/** A pinned province, off the same shared fetch the popup reads. */
function PlaceDetail({ name }: { name: string }) {
  const forecast = useSeasonalForecast();

  return (
    <>
      <SubjectHeader
        eyebrow="Province"
        title={name}
        issuedAt={
          forecast.status === "ready" ? forecast.province.issuedAt : null
        }
      />
      <TabsContent value="table">
        {forecast.status === "idle" ? (
          // A pin under a product CIS publishes no province forecast for.
          <Notice>No detail for this product yet.</Notice>
        ) : forecast.status === "loading" ? (
          <TableSkeleton rows={PROVINCE_GROUPS[0].rows.length} />
        ) : forecast.status === "error" ? (
          <Notice>Forecast unavailable.</Notice>
        ) : forecast.status === "none" ? (
          <Notice>No forecast for this place.</Notice>
        ) : (
          <ForecastAccordion
            groups={PROVINCE_GROUPS}
            months={forecast.province.months}
          />
        )}
      </TabsContent>
      <TabsContent value="chart">
        <ChartPlaceholder />
      </TabsContent>
      <TabsContent value="about">
        <Notice>No further information for this province yet.</Notice>
      </TabsContent>
    </>
  );
}

/**
 * A station: its forecast out of the national index the pills are drawn from
 * — no request of its own — and its metadata, which is the one request a
 * station click costs (and only the first time; see useStationMeta).
 */
function StationDetail({ stationId }: { stationId: number }) {
  const forecasts = useSeasonalStations(true);
  const meta = useStationMeta(stationId);
  const forecast =
    forecasts.status === "ready"
      ? forecasts.stations.get(stationId)
      : undefined;

  return (
    <>
      <SubjectHeader
        eyebrow="Station"
        title={forecast?.name ?? `Station ${stationId}`}
        issuedAt={forecast?.issuedAt ?? null}
      />
      <TabsContent value="table">
        {forecasts.status === "loading" ? (
          <TableSkeleton rows={STATION_GROUPS[0].rows.length} />
        ) : forecasts.status === "error" ? (
          <Notice>Forecast unavailable.</Notice>
        ) : !forecast ? (
          <Notice>No forecast for this station.</Notice>
        ) : (
          <ForecastAccordion groups={STATION_GROUPS} months={forecast.months} />
        )}
      </TabsContent>
      <TabsContent value="chart">
        <ChartPlaceholder />
      </TabsContent>
      <TabsContent value="about">
        <StationFacts meta={meta} />
      </TabsContent>
    </>
  );
}

/**
 * What there is to know about a station besides its forecast: type, elevation,
 * the normals the forecast is read against. Skeleton while the one request is
 * out.
 */
function StationFacts({ meta }: { meta: ReturnType<typeof useStationMeta> }) {
  if (meta.status === "loading") {
    return (
      <div role="status" className="border-t border-line">
        <span className="sr-only">Loading station details…</span>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex h-[33px] items-center gap-4 border-b border-line px-3.5"
          >
            <Skeleton className="h-2.5 w-16 rounded-full bg-line" />
            <Skeleton className="ml-auto h-2.5 w-24 rounded-full bg-line" />
          </div>
        ))}
      </div>
    );
  }
  if (meta.status !== "ready") {
    return <Notice>Station details unavailable.</Notice>;
  }

  const { elevation, type, norPeriod } = meta.data;
  const facts = [
    type && (["Type", type.toUpperCase()] as const),
    elevation !== null &&
      (["Elevation", `${Math.round(elevation)} m`] as const),
    norPeriod && (["Normals", norPeriod] as const),
  ].filter((fact) => !!fact);
  if (facts.length === 0) {
    return <Notice>No details recorded for this station.</Notice>;
  }

  return (
    <dl className="border-t border-line">
      {facts.map(([term, value]) => (
        <div
          key={term}
          className="flex h-[33px] items-center justify-between gap-4 border-b border-line px-3.5 text-[12px]"
        >
          <dt className="text-fg-subtle">{term}</dt>
          <dd className="font-cis-mono text-fg-heading">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The Chart tab until the plots are drawn. */
function ChartPlaceholder() {
  return <Notice>Charts are not available yet.</Notice>;
}

const ISSUED = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  // The issuance's own zone. `issuedAt` carries +08:00, so this is the date
  // PAGASA issued on, whatever zone the reader is in.
  timeZone: "Asia/Manila",
});

function SubjectHeader({
  eyebrow,
  title,
  issuedAt,
}: {
  eyebrow: string;
  title: string;
  issuedAt: string | null;
}) {
  return (
    <div className="px-3.5 pt-3 pb-2.5">
      <div className="flex items-baseline justify-between gap-3 font-cis-mono text-[10px]/3 font-medium tracking-[0.02em] text-fg-subtle">
        <span>{eyebrow}</span>
        {issuedAt && <span>Issued {ISSUED.format(new Date(issuedAt))}</span>}
      </div>
      <p className="mt-0.5 text-[15px]/5 font-semibold text-fg-heading">
        {title}
      </p>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-line px-3.5 py-6 text-center text-[12px] text-fg-body">
      {children}
    </p>
  );
}

/**
 * The table's silhouette while its data is out: a header and one line per
 * row, so the panel is already the height it is about to be.
 */
function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" className="border-t border-line">
      <span className="sr-only">Loading forecast…</span>
      {Array.from({ length: rows + 1 }, (_, index) => (
        <div
          key={index}
          className="flex h-[33px] items-center gap-4 border-b border-line px-3"
        >
          <Skeleton className="h-2.5 w-20 rounded-full bg-line" />
          <Skeleton className="ml-auto h-2.5 w-44 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}
