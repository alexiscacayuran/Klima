import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown01,
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Funnel,
  LayoutList,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconStack } from "@/components/reui/icon-stack";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TERCILE_TAGS } from "@/map/config/colorScales";
import type { Tercile } from "@/map/config/colorScales";
import { TERCILE_NAMES } from "@/map/config/detailRows";
import { ISLAND_GROUPS } from "@/map/config/islandGroups";
import type { IslandGroup } from "@/map/config/islandGroups";
import {
  cisProductForVariable,
  findProduct,
  productIdFromKey,
} from "@/map/config/products";
import { formatIssuedAt, formatStepId } from "@/map/config/timeline";
import { choroplethMonth, useChoropleth } from "@/map/hooks/useChoropleth";
import type { Choropleth } from "@/map/hooks/useChoropleth";
import { useSidePanels } from "@/map/state/useSidePanels";
import { useSelection } from "@/map/state/useSelection";
import { inkOn, isPale } from "@/map/utils/ink";
import { BLUE, GREEN, YELLOW } from "./charts/chartStyle";
import { ClassDonut } from "./charts/ClassDonut";
import {
  byIsland,
  classCounts,
  droughtClassing,
  droughtUnits,
  islandDistributions,
  leadClass,
  METRICS_FOR,
  PN_CLASSING,
  RANK_METRICS,
  ranking,
  tercileCounts,
} from "./overviewSummary";
import type {
  ClassCount,
  IslandDistribution,
  OverviewSource,
  OverviewUnit,
  RankedUnit,
  RankMetric,
} from "./overviewSummary";
import { NAME_COLUMNS, paginateIslands } from "./islandPages";
import type { IslandPage, IslandSort } from "./islandPages";
import { PanelIconButton, SidePanel } from "./SidePanel";
import { useOverviewUnits } from "./useOverviewUnits";

export type OverviewPanelProps = {
  /** Placement and height cap from the dock; the frame sizes its own width. */
  className?: string;
  /** Put away into the dock's corner, still mounted — see SidePanel `closed`. */
  closed?: boolean;
};

/**
 * A summary of the selected product as a whole — the right-hand slot's
 * resting state.
 *
 * Open at startup, and dismissed either by its own close button or by the
 * detail panel taking the slot. It does not come back on its own when the
 * detail panel closes — the button the empty slot leaves behind is how it
 * returns (see PanelDock).
 *
 * For the seasonal forecast it is the scrubbed month nationally: how many
 * provinces or stations fall in each percent-of-normal class, the same split
 * per island group, the stations' likeliest outcomes, and the wettest and
 * driest places. For El Niño / La Niña it is the drought layer's scrubbed
 * month: how many provinces are in each status, nationally and per island
 * group. Every figure is a count of the fan-outs the map already draws from
 * (see useOverviewUnits, useChoropleth), so it costs no request of its own
 * and cannot disagree with the map beneath it. Other products publish nothing
 * to summarise yet, and say so.
 *
 * It expands to two columns at the detail panel's width, and shares that
 * panel's flag: the width belongs to the slot the two take turns in (see
 * SidePanelsState.panelExpanded).
 */
export function OverviewPanel({ className, closed }: OverviewPanelProps) {
  const { variable, date } = useSelection();
  const { closeOverview, panelExpanded, togglePanelExpanded } = useSidePanels();
  const product = variable
    ? findProduct(productIdFromKey(variable))
    : undefined;
  const seasonal = cisProductForVariable(variable) === "seasonal";
  // The drought layers' statuses; null under any other layer, which asks for
  // nothing.
  const choropleth = useChoropleth();
  const summarised = seasonal || choropleth !== null;
  // An empty state has nothing to spread across two columns, so a product
  // switch away from a summarised one draws it narrow whatever the flag says.
  const wide = summarised && panelExpanded;

  return (
    <SidePanel
      closed={closed}
      title="Overview"
      className={cn(
        // The detail panel's wide size (see DetailPanel), held at the 640px the
        // two columns need. On a viewport too narrow for both, the minimum
        // wins over the cap: the rail is closed on the way to wide, so there
        // is nothing on the left for it to cover.
        wide
          ? "w-[50vw] max-w-[calc(100vw-22rem)] min-w-[min(640px,calc(100vw-3rem))]"
          : "w-[360px]",
        className,
      )}
      actions={
        <>
          {summarised && (
            <PanelIconButton
              label={wide ? "Collapse overview" : "Expand overview"}
              onClick={togglePanelExpanded}
            >
              {wide ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </PanelIconButton>
          )}
          <PanelIconButton label="Close overview" onClick={closeOverview}>
            <X aria-hidden />
          </PanelIconButton>
        </>
      }
    >
      {seasonal ? (
        <SeasonalOverview
          productLabel={product?.label ?? "Seasonal forecast"}
          stepId={date}
          wide={wide}
        />
      ) : choropleth ? (
        <DroughtOverview
          choropleth={choropleth}
          productLabel={product?.label ?? "Drought"}
          stepId={date}
          wide={wide}
        />
      ) : (
        <Empty className="gap-3 px-6 py-8">
          <EmptyHeader>
            <EmptyIcon>
              <LayoutList />
            </EmptyIcon>
            <EmptyTitle className="text-[13px] text-fg-heading">
              {product ? `${product.label} summary` : "Summary"}
            </EmptyTitle>
            <EmptyDescription className="text-[12px] text-fg-body">
              Not available yet. Select a place or a station on the map for its
              detail.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </SidePanel>
  );
}

/**
 * The seasonal summary for one month, at the resolution its tabs pick.
 *
 * The resolution, ranking metric and island filter change what this panel
 * counts and nothing on the map. They outlive a month change, so scrubbing
 * the timeline re-counts the same view. The resolution is kept with the side
 * panels rather than here, because the dock's button counts it too (see
 * SidePanelsState.overviewSource).
 */
function SeasonalOverview({
  productLabel,
  stepId,
  wide,
}: {
  productLabel: string;
  stepId: string | null;
  wide: boolean;
}) {
  const { overviewSource: source, setOverviewSource: setSource } =
    useSidePanels();
  const [metric, setMetric] = useState<RankMetric>("pn");
  const [island, setIsland] = useState<IslandGroup | "all">("all");
  const [islandSort, setIslandSort] = useState<IslandSort>("name");
  const lists = useOverviewUnits(stepId);

  const units = lists.units[source];
  const failed = lists.failed[source];
  // Temperature is per station only, so the anomaly pill is not offered for
  // provinces. The choice is kept rather than reset, and comes back with the
  // stations tab.
  const metrics = METRICS_FOR[source];
  const shownMetric = metrics.includes(metric) ? metric : "pn";
  const noun = source === "provinces" ? "provinces" : "stations";
  const { issuedAt } = lists;

  // Nothing to summarise, so the error stands in for the whole panel body
  // rather than sitting under a header and tabs that lead nowhere.
  if (units === null && failed) {
    return (
      <Unavailable>
        The forecast couldn't be reached. Try again in a moment.
      </Unavailable>
    );
  }

  return (
    <>
      {/* The resolution tabs under the date at either width, never beside it. */}
      <OverviewHeading
        productLabel={productLabel}
        issuedAt={issuedAt}
        // Pending only while neither resolution has answered: one that
        // answers with no rows has no issuance to name, and says so in the
        // "No forecast published" notice below.
        pending={!lists.answered}
        stepId={stepId}
        wide={wide}
      >
        {/* Held back only until either resolution has something to show: once
            one has, the tabs are live, so a pending tab never hides the other. */}
        {lists.units.provinces === null && lists.units.stations === null ? (
          <Skeleton
            aria-hidden
            className="h-8 w-38 self-start rounded-lg bg-line"
          />
        ) : (
          <Tabs
            value={source}
            onValueChange={(value) => setSource(value as OverviewSource)}
            className="items-start"
          >
            <TabsList aria-label="Resolution">
              {RESOLUTION_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </OverviewHeading>

      {units === null ? (
        <OverviewSkeleton />
      ) : units.length === 0 ? (
        <Notice>No forecast published for this month.</Notice>
      ) : (
        <div
          className={cn(
            "grid",
            wide
              ? "mt-3.5 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
              : "grid-cols-1",
          )}
        >
          <Section
            title="Percent of normal"
            wide={wide}
            className={cn(wide && "border-r border-line")}
          >
            <ClassBreakdown
              classes={classCounts(units, PN_CLASSING)}
              noun={noun}
              none="No percent-of-normal readings for this month."
              wide={wide}
            />
          </Section>
          <Section
            title="By island group"
            // Only the expanded list names places, so only it has an order.
            actions={
              wide && (
                <IslandSortToggle value={islandSort} onChange={setIslandSort} />
              )
            }
            wide={wide}
            className={wide ? undefined : "gap-2.5"}
          >
            <IslandGroups
              islands={islandDistributions(units, PN_CLASSING)}
              wide={wide}
              sort={islandSort}
              resetKey={`${source}:${islandSort}`}
            />
          </Section>
          {source === "stations" && (
            <Section
              title="Most likely outcome"
              wide={wide}
              className="col-span-full"
            >
              <TercileCards units={units} />
            </Section>
          )}
          <Ranking
            units={units}
            metrics={metrics}
            metric={shownMetric}
            onMetricChange={setMetric}
            island={island}
            onIslandChange={setIsland}
            wide={wide}
          />
        </div>
      )}
    </>
  );
}

const RESOLUTION_TABS = [
  { id: "provinces" as const, label: "Provinces" },
  { id: "stations" as const, label: "Stations" },
];

/**
 * The drought summary for one month of the selected layer: how many provinces
 * are in each status nationally, and the same split per island group.
 *
 * The seasonal summary's first two sections, counting statuses rather than
 * percent-of-normal classes. Provinces only — drought publishes no stations —
 * so there are no resolution tabs, and nothing to rank: a status is a class,
 * not a figure to order places by. The island order outlives a month change,
 * as the seasonal one does.
 */
function DroughtOverview({
  choropleth,
  productLabel,
  stepId,
  wide,
}: {
  choropleth: Choropleth;
  productLabel: string;
  stepId: string | null;
  wide: boolean;
}) {
  const [islandSort, setIslandSort] = useState<IslandSort>("name");
  const { variant, months } = choropleth;
  const month = choroplethMonth(choropleth, stepId);
  const classing = useMemo(() => droughtClassing(variant.classes), [variant]);
  const units = useMemo(() => (month ? droughtUnits(month) : null), [month]);
  const pending = months.status === "loading" || months.status === "idle";

  if (months.status === "error") {
    return (
      <Unavailable>
        The drought {variant.noun} couldn't be reached. Try again in a moment.
      </Unavailable>
    );
  }

  return (
    <>
      <OverviewHeading
        productLabel={productLabel}
        issuedAt={month?.issuedAt}
        pending={pending}
        stepId={stepId}
        wide={wide}
      />

      {pending || stepId === null ? (
        <OverviewSkeleton />
      ) : !units?.length ? (
        <Notice>No drought {variant.noun} published for this month.</Notice>
      ) : (
        <div
          className={cn(
            "grid",
            wide
              ? "mt-3.5 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
              : "grid-cols-1",
          )}
        >
          {/* The last row has nothing under it to be ruled off from. */}
          <Section
            title={`Drought ${variant.noun}`}
            wide={wide}
            className={cn(wide && "border-r border-b-0 border-line")}
          >
            <ClassBreakdown
              classes={classCounts(units, classing)}
              noun="provinces"
              none="No drought status for this month."
              wide={wide}
            />
          </Section>
          <Section
            title="By island group"
            // Only the expanded list names places, so only it has an order.
            actions={
              wide && (
                <IslandSortToggle value={islandSort} onChange={setIslandSort} />
              )
            }
            wide={wide}
            className={cn("border-b-0", !wide && "gap-2.5")}
          >
            <IslandGroups
              islands={islandDistributions(units, classing)}
              wide={wide}
              sort={islandSort}
              resetKey={`${variant.series}:${islandSort}`}
            />
          </Section>
        </div>
      )}
    </>
  );
}

/**
 * The product, its issuance and the scrubbed month, over whatever the summary
 * sets under them — the seasonal resolution tabs.
 */
function OverviewHeading({
  productLabel,
  issuedAt,
  pending,
  stepId,
  wide,
  children,
}: {
  productLabel: string;
  issuedAt: string | undefined;
  /** The issuance is still being asked for: a placeholder holds its place. */
  pending: boolean;
  stepId: string | null;
  wide: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3.5">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3 text-[12px] font-medium text-fg-subtle">
          <span className="tracking-[0.4px] uppercase">{productLabel}</span>
          {issuedAt ? (
            <span className="shrink-0 tabular-nums">
              Issued {formatIssuedAt(issuedAt)}
            </span>
          ) : (
            pending && (
              <Skeleton className="h-2.5 w-24 self-center rounded-full bg-line" />
            )
          )}
        </div>
        {stepId ? (
          <span
            className={cn(
              "font-semibold tracking-[-0.01em] text-fg-heading",
              wide ? "text-2xl" : "text-xl",
            )}
          >
            {formatStepId(stepId)}
          </span>
        ) : (
          <Skeleton className="my-1.5 h-4 w-36 rounded-full bg-line" />
        )}
      </div>
      {children}
    </div>
  );
}

/** A summary whose data could not be reached, in place of the whole body. */
function Unavailable({ children }: { children: ReactNode }) {
  return (
    <Empty className="gap-3 px-6 py-8">
      <EmptyHeader>
        <EmptyIcon>
          <CloudOff />
        </EmptyIcon>
        <EmptyTitle className="text-[13px] text-fg-heading">
          Overview unavailable
        </EmptyTitle>
        <EmptyDescription className="text-[12px] text-fg-body">
          {children}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function Section({
  title,
  actions,
  wide,
  className,
  children,
}: {
  title: string;
  /** Controls on the title's row, at its end. */
  actions?: ReactNode;
  wide: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 border-b border-line",
        wide ? "p-5" : "p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-fg-heading">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * The month's units by class — percent of normal, or drought status: a donut
 * with the largest class pulled out and counted in the middle, and a legend of
 * all four beside it.
 */
function ClassBreakdown({
  classes,
  noun,
  none,
  wide,
}: {
  classes: ClassCount[];
  noun: string;
  /** Said in the chart's place when no unit is in any class. */
  none: string;
  wide: boolean;
}) {
  const total = classes.reduce((sum, each) => sum + each.count, 0);
  const lead = leadClass(classes);

  if (total === 0) {
    return <p className="text-[12px] text-fg-body">{none}</p>;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-6 gap-y-4",
        wide ? "flex-row" : "flex-col",
      )}
    >
      <ClassDonut
        classes={classes}
        lead={lead}
        label={`${lead.count} of ${total} ${noun} ${lead.phrase}`}
        className={wide ? "size-[200px]" : "size-48"}
      >
        <span className="font-cis-mono text-[30px]/none font-semibold tracking-[-0.02em] text-fg-heading">
          {lead.count}
        </span>
        <span className="mt-0.5 max-w-24 text-center text-[11px]/[1.3] text-fg-body">
          {noun}
          <br />
          {lead.phrase}
        </span>
      </ClassDonut>
      <ul
        className={cn(
          "grid content-center self-stretch",
          wide
            ? "min-w-[170px] flex-[1_1_170px] grid-cols-1"
            : "grid-cols-2 gap-x-4 gap-y-1.5",
        )}
      >
        {classes.map((each) => (
          <li
            key={each.label}
            className={cn(
              "flex min-w-0 items-center gap-2",
              wide && "border-b border-line py-[9px]",
            )}
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-[2px]",
                // Drought's "Not affected" is published as white: edged, or
                // the swatch is not there on a white panel.
                isPale(each.color) && "ring-1 ring-fg-body ring-inset",
              )}
              style={{ background: each.color }}
            />
            <span className="truncate text-[12px] text-fg-body">
              {each.label}
            </span>
            <span className="ml-auto font-cis-mono text-[12px] font-medium text-fg-heading">
              {each.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The same classes per island group, as one stacked bar each.
 *
 * Expanded, every bar heads the list of places in each of its classes, paged
 * to the height the percent-of-normal section beside it gives the row (see
 * islandPages).
 */
function IslandGroups({
  islands,
  wide,
  sort,
  resetKey,
}: {
  islands: readonly IslandDistribution[];
  wide: boolean;
  /** The expanded list's order. */
  sort: IslandSort;
  /**
   * Back to the first page when this changes: the resolution or drought
   * layer, or the order — not the month.
   */
  resetKey: string;
}) {
  if (wide)
    return (
      <IslandGroupPages islands={islands} sort={sort} resetKey={resetKey} />
    );
  return islands.map((island) => (
    <IslandBar key={island.group} {...island} height="h-[18px]" />
  ));
}

const ISLAND_SORTS: Record<
  IslandSort,
  { label: string; icon: LucideIcon; next: IslandSort }
> = {
  name: { label: "Sort by name", icon: ArrowDownAZ, next: "class" },
  class: { label: "Sort by category", icon: ArrowDown01, next: "name" },
};

/**
 * The expanded list's order, as one compact button on the section's title
 * row that names the order in force and flips to the other on a press. On
 * the field radius and outline the ranking's island filter uses. Pulled in by
 * 2px top and bottom so the 24px button leaves the row the title's own
 * height, and the section keeps its line with the one beside it.
 */
function IslandSortToggle({
  value,
  onChange,
}: {
  value: IslandSort;
  onChange: (sort: IslandSort) => void;
}) {
  const { label, icon: Icon, next } = ISLAND_SORTS[value];
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => onChange(next)}
      title={`Switch to ${ISLAND_SORTS[next].label.toLowerCase()}`}
      className={cn(
        "-my-0.5 rounded-(--radius-field) border-line-strong bg-transparent text-[12px] font-normal text-fg-body",
        "hover:border-fg-subtle hover:bg-transparent hover:text-fg-heading dark:bg-transparent dark:hover:bg-transparent",
        "focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50",
      )}
    >
      <Icon aria-hidden data-icon="inline-start" className="text-fg-subtle" />
      {label}
    </Button>
  );
}

/**
 * One group's name and bar. A segment is counted in place once it is a
 * tenth of its bar — narrower, the figure would not fit — and every one says
 * its count on hover.
 */
function IslandBar({
  group,
  classes,
  total,
  height,
  stacked = false,
  continued = false,
}: {
  group: IslandGroup;
  classes: readonly ClassCount[];
  total: number;
  height: string;
  /** The name on its own line above the bar, rather than beside it. */
  stacked?: boolean;
  /** Carried over from the page before: said after the name. */
  continued?: boolean;
}) {
  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col gap-1"
          : "grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2.5",
      )}
    >
      <span className={cn("text-[13px] text-fg-heading", stacked && "h-5")}>
        {group}
        {continued && <span className="text-fg-subtle"> · continued</span>}
      </span>
      <div
        className={cn(
          "flex gap-0.5 overflow-hidden rounded",
          height,
          total === 0 && "bg-line",
        )}
      >
        {classes
          .filter((each) => each.count > 0)
          .map((each) => (
            <div
              key={each.label}
              title={`${each.label}: ${each.count}`}
              // `flex-grow` is a layout property, and transitioned here anyway:
              // a stacked bar's segments have no transform equivalent that
              // leaves their counts undistorted, and there are twelve of them.
              className={cn(
                "flex min-w-0 basis-0 items-center justify-center overflow-hidden font-cis-mono text-[11px] font-semibold transition-[flex-grow] duration-250 ease-strong-in-out motion-reduce:transition-none",
                // Drought's "Not affected" is published as white: edged, or
                // the segment is not there on a white panel. The bar's own
                // rounding on its end segments, so the edge follows it.
                "first:rounded-l last:rounded-r",
                isPale(each.color) && "ring-1 ring-line-strong ring-inset",
              )}
              style={{
                flexGrow: each.count,
                background: each.color,
                color: inkOn(each.color),
              }}
            >
              {each.count / total >= 0.1 ? each.count : ""}
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * The expanded list, a page at a time.
 *
 * The list is absolutely positioned inside a box that stretches with the grid
 * row, so it adds no height of its own: the row is as tall as the section
 * beside it, and the box's measured height is how much of the list a page
 * holds. The pager keeps its line whether or not there is a second page, so
 * showing it never changes the room it is counting.
 */
function IslandGroupPages({
  islands,
  sort,
  resetKey,
}: {
  islands: readonly IslandDistribution[];
  sort: IslandSort;
  resetKey: string;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const height = useHeight(box);
  const [requested, setPage] = useState(0);
  // Which way the last turn went, so the page enters from that side.
  const [direction, setDirection] = useState<"next" | "prev">("next");
  // Reset in render rather than by remounting on a key, so the bars on the
  // page stay mounted and morph to the new resolution's counts. A new month
  // keeps the page, clamped below.
  const [pagedFor, setPagedFor] = useState(resetKey);
  if (pagedFor !== resetKey) {
    setPagedFor(resetKey);
    setPage(0);
  }
  const turn = (to: number) => {
    setDirection(to > page ? "next" : "prev");
    setPage(to);
  };
  const pages = useMemo(
    () => (height > 0 ? paginateIslands(islands, height, sort) : []),
    [islands, height, sort],
  );
  // Clamped rather than reset: a taller row means fewer pages, and the reader
  // stays as near the place they were as the new count allows.
  const page = Math.min(requested, Math.max(0, pages.length - 1));

  return (
    <>
      <div ref={setBox} className="relative min-h-40 flex-1">
        <div className="absolute inset-0 overflow-hidden">
          {pages[page] && (
            // Keyed by page, so each turn mounts a fresh list that enters
            // (see .overview-page) rather than swapping its text in place.
            <div
              key={page}
              className="overview-page"
              data-direction={direction}
            >
              <IslandPageView page={pages[page]} />
            </div>
          )}
        </div>
      </div>
      <nav
        aria-label="Island group pages"
        className={cn(
          "flex h-7 items-center justify-end gap-1",
          pages.length < 2 && "invisible",
        )}
      >
        <span className="mr-1.5 font-cis-mono text-[11px] text-fg-subtle">
          {page + 1} / {pages.length}
        </span>
        <PanelIconButton
          label="Previous page"
          onClick={() => turn(page - 1)}
          disabled={page === 0}
        >
          <ChevronLeft aria-hidden />
        </PanelIconButton>
        <PanelIconButton
          label="Next page"
          onClick={() => turn(page + 1)}
          disabled={page >= pages.length - 1}
        >
          <ChevronRight aria-hidden />
        </PanelIconButton>
      </nav>
    </>
  );
}

/**
 * One page: each group's name and bar, then its places two to a line, each
 * dotted in its class's colour, with a rule between groups. The heights here
 * are the ones islandPages packs with — `mt-2` and a 1px rule, `pt-2` over an
 * `h-5` name, `gap-1`, a 26px bar and `pb-1.5`, `h-5` lines — and have to
 * change with them.
 */
function IslandPageView({ page }: { page: IslandPage }) {
  return page.map((island, index) => (
    <div key={island.group}>
      {index > 0 && <Separator className="mt-2 bg-line" />}
      <div className="pt-2 pb-1.5">
        <IslandBar
          {...island}
          height="h-[26px]"
          stacked
          continued={island.continued}
        />
      </div>
      <ul
        className="grid gap-x-4"
        style={{
          gridTemplateColumns: `repeat(${NAME_COLUMNS}, minmax(0, 1fr))`,
        }}
      >
        {island.listed.map(({ unit, color, label }) => (
          <li
            key={unit.key}
            title={`${unit.title} · ${label}`}
            className="flex h-5 min-w-0 items-center gap-2 text-[12px] text-fg-heading"
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                // Near normal is published as white: edged, or the dot is
                // not there on a white panel.
                isPale(color) && "ring-1 ring-fg-body ring-inset",
              )}
              style={{ background: color }}
            />
            <span className="truncate">{unit.name}</span>
            <span className="sr-only">, {label}</span>
          </li>
        ))}
      </ul>
    </div>
  ));
}

/** An element's content height, kept current as it resizes; 0 until measured. */
function useHeight(node: HTMLElement | null): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return height;
}

/**
 * The outcomes' colours, the tercile chart's (charts/TercileProbabilityChart):
 * percent of normal's colours for the categories of the same names, so above,
 * near and below normal read alike on every chart and count.
 */
const TERCILE_COLORS: Record<Tercile, string> = {
  above: BLUE,
  near: GREEN,
  below: YELLOW,
};

/**
 * How many stations have each outcome as their likeliest. Each card opens
 * the list of which, at either width: the count is what the section is for,
 * and the names are a click away rather than a column the narrow panel's
 * cards, a third of 360px, could never fit.
 */
function TercileCards({ units }: { units: readonly OverviewUnit[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {tercileCounts(units).map((each) => (
        <TercileCard key={each.tercile} {...each} />
      ))}
    </div>
  );
}

const TERCILE_CARD =
  "flex flex-col gap-1.5 rounded-field border border-line bg-well p-2.5 text-left";

/**
 * One outcome's card: a button that opens its stations, or, with none, the
 * same card inert — there is nothing to list, so nothing to press.
 *
 * Spans throughout, not divs: the card is a button, which may hold phrasing
 * content only.
 */
function TercileCard({
  tercile,
  count,
  total,
  units,
}: {
  tercile: Tercile;
  count: number;
  total: number;
  /** Surest first, as tercileCounts orders them. */
  units: readonly OverviewUnit[];
}) {
  const name = TERCILE_NAMES[tercile];
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-full"
          style={{ background: TERCILE_COLORS[tercile] }}
        />
        <span className="font-cis-mono text-[11px] font-medium text-fg-body">
          {TERCILE_TAGS[tercile]}
        </span>
      </span>
      <span className="font-cis-mono text-2xl/none font-semibold text-fg-heading">
        {count}
      </span>
      <span className="text-[11px]/[1.3] text-fg-body">{name}</span>
      <span className="block h-1 overflow-hidden rounded-full bg-line">
        <span
          className="overview-bar block h-full rounded-full"
          style={{
            transform: `scaleX(${total ? count / total : 0})`,
            background: TERCILE_COLORS[tercile],
          }}
        />
      </span>
    </>
  );

  if (count === 0) return <div className={TERCILE_CARD}>{body}</div>;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          TERCILE_CARD,
          "cursor-pointer outline-none transition-colors hover:border-line-strong",
          "focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50 data-popup-open:border-brand",
        )}
      >
        {body}
      </PopoverTrigger>
      <PopoverContent
        // Out over the map, beside the panel, rather than across the cards it
        // is listing for.
        side="left"
        align="start"
        sideOffset={12}
        className={cn(
          "w-64 gap-3 rounded-panel border border-line bg-panel-strong p-3 font-cis",
          "text-fg-body shadow-float ring-0 backdrop-blur-md",
        )}
      >
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-[13px] font-semibold text-fg-heading">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: TERCILE_COLORS[tercile] }}
            />
            {name}
          </PopoverTitle>
          <PopoverDescription className="text-[12px] text-fg-subtle">
            {count} {count === 1 ? "station" : "stations"}, high probability
            first
          </PopoverDescription>
        </PopoverHeader>
        <ScrollArea className="-mr-2 *:data-[slot=scroll-area-viewport]:max-h-[min(24rem,60vh)] *:data-[slot=scroll-area-viewport]:pr-2">
          <div className="flex flex-col gap-2">
            <StationsByIsland units={units} outcome={name.toLowerCase()} />
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Stations under island-group heads, each with the chance of `outcome`, in
 * the order given within each group.
 */
function StationsByIsland({
  units,
  outcome,
}: {
  units: readonly OverviewUnit[];
  /** Lower case, for the percentage's tooltip. */
  outcome: string;
}) {
  return byIsland(units).map(({ group, units: listed }) => (
    <div key={group ?? "other"} className="flex flex-col">
      <h4 className="pb-0.5 text-[10px] font-medium tracking-[0.4px] text-fg-subtle uppercase">
        {group ?? "Other"}
      </h4>
      <ul>
        {listed.map((unit) => (
          <li
            key={unit.key}
            className="flex h-5 min-w-0 items-center gap-2 text-[12px]"
          >
            <span title={unit.title} className="truncate text-fg-heading">
              {unit.name}
            </span>
            {unit.tercileProbability !== null && (
              <span
                title={`${Math.round(unit.tercileProbability)}% chance of ${outcome}`}
                className="ml-auto shrink-0 font-cis-mono text-[11px] text-fg-body"
              >
                {Math.round(unit.tercileProbability)}%
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  ));
}

/** The island filter's options, as the Select's `items` so its trigger prints the label. */
const ISLAND_OPTIONS: { value: IslandGroup | "all"; label: string }[] = [
  { value: "all", label: "All island groups" },
  ...ISLAND_GROUPS.map((group) => ({ value: group, label: group })),
];

/** The top and bottom of the month, by the metric and island group picked. */
function Ranking({
  units,
  metrics,
  metric,
  onMetricChange,
  island,
  onIslandChange,
  wide,
}: {
  units: readonly OverviewUnit[];
  metrics: readonly RankMetric[];
  metric: RankMetric;
  onMetricChange: (metric: RankMetric) => void;
  island: IslandGroup | "all";
  onIslandChange: (island: IslandGroup | "all") => void;
  wide: boolean;
}) {
  const spec = RANK_METRICS[metric];
  const { high, low } = ranking(units, metric, island);

  return (
    <section
      className={cn(
        "col-span-full flex flex-col gap-2.5",
        wide ? "px-5 pt-5 pb-4" : "px-4 pt-4 pb-3",
      )}
    >
      {/* The title and, opposite it, among which places the ranking runs. */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-fg-heading">Ranking</h3>
        <Select
          items={ISLAND_OPTIONS}
          value={island}
          onValueChange={(value) => value && onIslandChange(value)}
        >
          <SelectTrigger
            aria-label="Island group"
            size="sm"
            className={cn(
              // Outlined, never filled: a hairline box on the field radius, so
              // the filter reads as a quiet control beside the title rather
              // than a second heading.
              "shrink-0 rounded-field border border-line-strong bg-transparent px-2 text-[13px] text-fg-body",
              "hover:border-fg-subtle hover:text-fg-heading dark:bg-transparent dark:hover:bg-transparent",
              "focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50 data-popup-open:border-brand",
            )}
          >
            <Funnel aria-hidden className="size-3.5 text-fg-subtle" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="end"
            alignItemWithTrigger={false}
            className="font-cis"
          >
            {ISLAND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tabs
        value={metric}
        onValueChange={(value) => onMetricChange(value as RankMetric)}
        className="items-start"
      >
        <TabsList aria-label="Rank by">
          {metrics.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              title={wide ? undefined : RANK_METRICS[id].label}
            >
              {wide ? RANK_METRICS[id].label : RANK_METRICS[id].shortLabel}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {high.length === 0 ? (
        <p className="py-3 text-center text-[12px] text-fg-body">
          Too few readings to rank.
        </p>
      ) : (
        <div
          className={cn(
            "grid gap-x-8 gap-y-1",
            wide ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <RankList title={spec.high} rows={high} metric={metric} />
          <RankList title={spec.low} rows={low} metric={metric} />
        </div>
      )}
    </section>
  );
}

function RankList({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: readonly RankedUnit[];
  metric: RankMetric;
}) {
  const spec = RANK_METRICS[metric];
  return (
    <div className="flex flex-col gap-0.5 pt-1">
      <h4 className="pb-1 text-[11px] font-medium tracking-[0.4px] text-fg-subtle uppercase">
        {title}
      </h4>
      <ol>
        {rows.map(({ unit, rank, value, share }) => {
          const mark = spec.mark(unit);
          const color = mark.color ?? "var(--cis-fg-subtle)";
          return (
            <li
              key={unit.key}
              className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 py-[5px]"
            >
              <span className="font-cis-mono text-[11px] text-fg-subtle">
                {rank}
              </span>
              <span
                title={unit.title}
                className="min-w-0 truncate text-[13px] text-fg-heading"
              >
                {unit.name}
              </span>
              <span className="flex items-center gap-1.5 font-cis-mono text-[12px] font-medium text-fg-heading">
                <span
                  title={mark.meaning ?? undefined}
                  className={cn(
                    "size-2 rounded-full",
                    // Near average is published as white: edged, or the dot
                    // is not there on a white panel.
                    mark.color &&
                      isPale(mark.color) &&
                      "ring-1 ring-fg-body ring-inset",
                  )}
                  style={{ background: color }}
                />
                {spec.format(value)}
              </span>
              <div className="col-[2/4] h-[3px] overflow-hidden rounded-full bg-line">
                <div
                  className="overview-bar h-full rounded-full"
                  style={{
                    transform: `scaleX(${share / 100})`,
                    background: color,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * An empty state's icon on ReUI's layered stack, in the CIS tokens rather than
 * the stock shadcn ones it ships with: the layers are filled with the panel
 * they sit on, and the icon takes the subtle ink the old square badge used.
 */
function EmptyIcon({ children }: { children: ReactNode }) {
  return (
    <EmptyMedia>
      <IconStack className="text-fg-heading **:data-[slot=icon-stack-content]:text-fg-subtle **:data-[slot=icon-stack-layer]:fill-panel-solid">
        {children}
      </IconStack>
    </EmptyMedia>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 border-t border-line px-3.5 py-6 text-center text-[12px] text-fg-body">
      {children}
    </p>
  );
}

/**
 * The summary's silhouette while its fan-out is out: the donut and its legend,
 * so the panel is already about the height it is about to be.
 */
function OverviewSkeleton() {
  return (
    <div
      role="status"
      className="mt-3 flex flex-col items-center gap-4 border-t border-line p-4"
    >
      <span className="sr-only">Loading overview…</span>
      <Skeleton className="h-2.5 w-28 self-start rounded-full bg-line" />
      <Skeleton className="size-48 rounded-full bg-line/60" />
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-2.5 rounded-full bg-line" />
        ))}
      </div>
    </div>
  );
}
