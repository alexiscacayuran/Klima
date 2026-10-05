import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ChartLine,
  Check,
  Copy,
  Info,
  Maximize2,
  Minimize2,
  Table,
  TableProperties,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PsgcLocation } from "@/api/locations";
import type { CisProductName } from "@/api/products";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PROVINCE_GROUPS, STATION_GROUPS } from "@/map/config/detailRows";
import { cisProductForVariable } from "@/map/config/products";
import { formatIssuedAt } from "@/map/config/timeline";
import { useDroughtDetail } from "@/map/hooks/useDroughtDetail";
import type { DroughtDetailState } from "@/map/hooks/useDroughtDetail";
import { useSeasonalForecast } from "@/map/hooks/useSeasonalForecast";
import { usePlaceProfile } from "@/map/hooks/usePlaceProfile";
import { useSeasonalStations } from "@/map/hooks/useSeasonalStations";
import { useStationMeta } from "@/map/hooks/useStationMeta";
import { useSidePanels } from "@/map/state/useSidePanels";
import { useSelection } from "@/map/state/useSelection";
import { tierLabel } from "@/map/types/features";
import type { AdminLocation } from "@/map/types/features";
import { ProvinceCharts, StationCharts } from "./charts/ForecastCharts";
import { DroughtTables } from "./DroughtTables";
import { ForecastTables } from "./ForecastTable";
import { PanelIconButton, SidePanel } from "./SidePanel";

export type DetailPanelProps = {
  /** Placement and height cap from the dock; the frame sizes its own width. */
  className?: string;
  /** Put away into the dock's corner, still mounted — see SidePanel `closed`. */
  closed?: boolean;
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
 * The header carries tabs in place of a title, with the subject's name above
 * whichever is showing. Which tabs depends on the selected layer's dataset
 * (see DATA_TABS) — Table and Chart for seasonal, Detail for drought — and
 * About is every one's. The tab outlives a change of subject: someone reading
 * charts goes on reading charts from one station to the next.
 */
export function DetailPanel({ className, closed }: DetailPanelProps) {
  const { pinned, station, variable } = useSelection();
  const { closeDetail, panelExpanded, togglePanelExpanded } = useSidePanels();
  const tabs = tabsFor(variable);
  // The reader's last pick, held even while a product without that tab is
  // showing, so that coming back to one with it finds it again. Until then the
  // product's first tab stands in, and a pick shared by both — About — stays.
  const [picked, setPicked] = useState<DetailTab>("table");
  const tab = tabs.includes(picked) ? picked : tabs[0];

  return (
    // `contents`: the root has to enclose both the tab list in the header and
    // the panels in the body, but the frame is what the dock lays out, so the
    // root must not become a box of its own around it.
    <Tabs
      value={tab}
      onValueChange={(value: DetailTab) => setPicked(value)}
      className="contents"
    >
      <SidePanel
        closed={closed}
        title="Detail"
        heading={
          <TabsList variant="line">
            {tabs.map((id) => {
              const { label, icon: Icon } = TABS[id];
              return (
                <TabsTrigger key={id} value={id}>
                  <Icon aria-hidden />
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        }
        className={cn(
          // Widens leftwards from the dock's right edge, which is why the dock
          // right-aligns its slot rather than fixing its width. Half the
          // viewport, but never so far that it reaches the product rail on the
          // other side: 22rem holds back the rail, both gutters and a gap.
          panelExpanded ? "w-[50vw] max-w-[calc(100vw-22rem)]" : "w-[360px]",
          className,
        )}
        actions={
          <>
            {/* lucide's `maximize-2` / `minimize-2` — the arrows named
              up-right-and-down-left-from-center and
              down-left-and-up-right-to-center. */}
            <PanelIconButton
              label={panelExpanded ? "Collapse panel" : "Expand panel"}
              onClick={togglePanelExpanded}
            >
              {panelExpanded ? (
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
          <PlaceDetail place={pinned} />
        ) : (
          // Unreachable while the provider keeps the panel shut without a
          // subject; said plainly rather than rendering nothing, in case it is.
          <Notice>Select a place or a station on the map.</Notice>
        )}
      </SidePanel>
    </Tabs>
  );
}

type DetailTab = "table" | "chart" | "detail" | "about";

const TABS: Record<DetailTab, { label: string; icon: LucideIcon }> = {
  table: { label: "Table", icon: Table },
  chart: { label: "Chart", icon: ChartLine },
  detail: { label: "Detail", icon: TableProperties },
  about: { label: "About", icon: Info },
};

/**
 * The tabs a dataset's issuance is read under, ahead of About.
 *
 * Keyed by the CIS dataset rather than the rail product, as the choropleths
 * are (see config/choropleths): what the tabs can show is a question of the
 * data's shape, not of which bulletin PAGASA lists it under.
 *
 * Seasonal publishes quantities, read as figures and as curves. Drought
 * publishes a class per month, which has no curve to draw, and splits its
 * months between an assessment and an outlook — one tab, with both. Anything
 * else keeps seasonal's pair, which says plainly under each that there is no
 * detail for the product yet.
 */
const DATA_TABS: Partial<Record<CisProductName, readonly DetailTab[]>> = {
  drought: ["detail"],
};
const DEFAULT_DATA_TABS: readonly DetailTab[] = ["table", "chart"];

const tabsFor = (variable: string | null): readonly DetailTab[] => {
  const dataset = cisProductForVariable(variable);
  return [
    ...((dataset && DATA_TABS[dataset]) ?? DEFAULT_DATA_TABS),
    "about",
  ];
};

/**
 * A pinned place, off the same shared fetch the popup reads.
 *
 * Usually a province, but not always: the level-2 tiles promote NCR up from
 * the regions and Kalayaan and two cities down from level 3 (see tierLabel),
 * so the tier is read rather than assumed. From the PSGC list once it is in,
 * since that is the record `location=` resolves against, and from the tile
 * until then. Both carry the same PSGC level, so the eyebrow does not change
 * when the list lands.
 */
function PlaceDetail({ place }: { place: AdminLocation }) {
  // Each idle unless the selected layer is its dataset's, so only one asks.
  const forecast = useSeasonalForecast();
  const drought = useDroughtDetail(place.psgc);
  const profile = usePlaceProfile(place.psgc);
  const geoLevel =
    profile.status === "ready" ? profile.data.place.geoLevel : null;
  const region = profile.status === "ready" ? profile.data.region : null;
  const tier = tierLabel(geoLevel ? { ...place, geoLevel } : place);
  // Both data tabs say the same while there is no forecast to draw, each in
  // its own silhouette while one is on the way.
  const pending = (skeleton: ReactNode) =>
    forecast.status === "idle" ? (
      // A pin under a product CIS publishes no province forecast for.
      <Notice>No detail for this product yet.</Notice>
    ) : forecast.status === "loading" ? (
      skeleton
    ) : forecast.status === "error" ? (
      <Notice>Forecast unavailable.</Notice>
    ) : (
      <Notice>No forecast for this place.</Notice>
    );

  return (
    <>
      <SubjectHeader
        eyebrow={tier}
        title={place.name}
        issuedAt={
          forecast.status === "ready"
            ? forecast.province.issuedAt
            : drought.status === "ready"
              ? drought.issuedAt
              : null
        }
      />
      <TabsContent value="table">
        {forecast.status === "ready" ? (
          <ForecastTables
            groups={PROVINCE_GROUPS}
            months={forecast.province.months}
          />
        ) : (
          pending(
            <TableSkeleton rows={PROVINCE_GROUPS[0].sections.flat().length} />,
          )
        )}
      </TabsContent>
      <TabsContent value="chart">
        {forecast.status === "ready" ? (
          <ProvinceCharts months={forecast.province.months} />
        ) : (
          pending(<ChartSkeleton charts={2} />)
        )}
      </TabsContent>
      <TabsContent value="detail">
        <DroughtDetail drought={drought} region={region} />
      </TabsContent>
      <TabsContent value="about">
        <PlaceFacts profile={profile} />
      </TabsContent>
    </>
  );
}

/**
 * A place's drought status, as the assessment and outlook table, or what
 * stands in for it.
 */
function DroughtDetail({
  drought,
  region,
}: {
  drought: DroughtDetailState;
  region: PsgcLocation | null;
}) {
  switch (drought.status) {
    case "ready":
      return <DroughtTables tables={drought.tables} region={region} />;
    case "loading":
      // The card's title, then the table's halves' names, its months and
      // its one row.
      return <TableSkeleton rows={3} label="Loading drought status…" />;
    case "error":
      return <Notice>Drought status unavailable.</Notice>;
    case "none":
      return <Notice>No drought status for this place.</Notice>;
    case "idle":
      // Unreachable while the tab only shows under a drought layer.
      return <Notice>No detail for this product yet.</Notice>;
  }
}

/**
 * A station: its forecast out of the national index the pills are drawn from
 * — no request of its own — and its metadata, which is the one request a
 * station click costs (and only the first time; see useStationMeta). The place
 * it stands in is named from the PSGC list the place tab reads, which is one
 * request for the session, not per station.
 */
function StationDetail({ stationId }: { stationId: number }) {
  const forecasts = useSeasonalStations(true);
  const meta = useStationMeta(stationId);
  const location = usePlaceProfile(
    meta.status === "ready" ? meta.data.locationId : null,
  );
  const forecast =
    forecasts.status === "ready"
      ? forecasts.stations.get(stationId)
      : undefined;
  // What both data tabs say without a forecast to draw (see PlaceDetail).
  const pending = (skeleton: ReactNode) =>
    forecasts.status === "loading" ? (
      skeleton
    ) : forecasts.status === "error" ? (
      <Notice>Forecast unavailable.</Notice>
    ) : (
      <Notice>No forecast for this station.</Notice>
    );

  return (
    <>
      <SubjectHeader
        // The type is in the metadata, not the index the title reads, so the
        // eyebrow holds a skeleton until it lands rather than saying "Station"
        // and then changing its mind.
        eyebrow={
          meta.status === "idle" || meta.status === "loading"
            ? null
            : stationTypeLabel(meta.status === "ready" ? meta.data.type : null)
        }
        title={
          forecast?.name ??
          (meta.status === "ready" ? meta.data.name : null) ??
          `Station ${stationId}`
        }
        issuedAt={forecast?.issuedAt ?? null}
      />
      <TabsContent value="table">
        {forecast ? (
          <ForecastTables groups={STATION_GROUPS} months={forecast.months} />
        ) : (
          pending(
            <TableSkeleton rows={STATION_GROUPS[0].sections.flat().length} />,
          )
        )}
      </TabsContent>
      <TabsContent value="chart">
        {forecast ? (
          <StationCharts months={forecast.months} />
        ) : (
          pending(<ChartSkeleton charts={3} />)
        )}
      </TabsContent>
      <TabsContent value="detail">
        {/* A station kept from a seasonal layer: drought has no points. */}
        <Notice>
          Drought status is published per province. Select one on the map.
        </Notice>
      </TabsContent>
      <TabsContent value="about">
        <StationFacts meta={meta} location={location} />
      </TabsContent>
    </>
  );
}

/**
 * What to call a station, by its `type`, for the subject header. The About tab
 * prints the code itself; this is the same fact said for a reader. A type this
 * build does not name — `radar`, or one added server-side — is called a
 * station and no more, rather than guessed at.
 */
const STATION_TYPE_NOUNS: Record<string, string> = {
  synop: "Synoptic station",
  agromet: "Agromet station",
  arg: "ARG station",
};

const stationTypeLabel = (type: string | null): string =>
  (type && STATION_TYPE_NOUNS[type.toLowerCase()]) || "Station";

/**
 * Everything `/stations/:id` says about a station besides its forecast: what
 * it is, where it stands, how it reports, and the normals the forecast is read
 * against. Only the rows the station has — a rain gauge has no code, address
 * or schedule, and a missing value is left out rather than shown as a dash.
 *
 * Held on the skeleton until the place is named as well, so that the Location
 * row does not arrive after the rest and push them down. If the place cannot
 * be named, that row is dropped and the PSGC below it still stands.
 */
function StationFacts({
  meta,
  location,
}: {
  meta: ReturnType<typeof useStationMeta>;
  location: ReturnType<typeof usePlaceProfile>;
}) {
  if (meta.status === "loading" || location.status === "loading") {
    return <FactsSkeleton rows={8} label="Loading station details…" />;
  }
  if (meta.status !== "ready") {
    return <Notice>Station details unavailable.</Notice>;
  }

  const station = meta.data;
  // The long name is often the short one upper-cased, which the title already
  // says. Shown only when it carries more — "BSU (MSAC) LA TRINIDAD" for the
  // station the title calls "BSU, La Trinidad".
  const longName =
    station.longName &&
    station.longName.toUpperCase() !== station.name?.toUpperCase()
      ? station.longName
      : null;
  // Latitude first, signed decimals, which is the order and form a map search
  // box and a spreadsheet both take. Five places is about a metre — finer than
  // a station's own siting is surveyed to.
  const coordinates =
    station.lat !== null && station.lng !== null
      ? `${station.lat.toFixed(5)}, ${station.lng.toFixed(5)}`
      : null;

  const facts = compact([
    station.type && {
      term: "Type",
      value: station.type.toUpperCase(),
      mono: true,
    },
    station.code !== null && {
      term: "PAGASA code",
      value: String(station.code),
      mono: true,
    },
    { term: "ID", value: String(station.id), mono: true },
    longName && { term: "Legacy name", value: longName },
    station.address && { term: "Address", value: station.address },
    coordinates && {
      term: "Coordinates",
      value: coordinates,
      mono: true,
      copyable: true,
    },
    station.elevation !== null && {
      term: "Elevation",
      value: `${Math.round(station.elevation)} m`,
      mono: true,
    },
    station.prsd && { term: "PRSD", value: station.prsd },
    station.obsTime && {
      term: "Observations",
      value: observationSchedule(station.obsTime),
    },
    station.yearRecord && {
      term: "Records",
      value: station.yearRecord,
      mono: true,
    },
    station.norPeriod && {
      term: "Normals",
      value: station.norPeriod,
      mono: true,
    },
    station.norRainfallRemarks && {
      term: "Rainfall normals",
      value: capitalise(station.norRainfallRemarks),
    },
    station.norTempRemarks && {
      term: "Temperature normals",
      value: capitalise(station.norTempRemarks),
    },
  ]);

  return <FactList facts={facts} />;
}

/**
 * `obsTime` as a reader says it. It arrives upper-cased — `"HOURLY"`,
 * `"3 HOURLY"`, `"12 HOURLY"` — and "3 hourly" is a phrase nobody uses.
 */
function observationSchedule(obsTime: string): string {
  const every = /^(\d+)\s*-?\s*hourly$/i.exec(obsTime);
  if (every) return `Every ${every[1]} hours`;
  return capitalise(obsTime.toLowerCase());
}

const capitalise = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * What the PSGC list says about a place: where it sits, what it holds, and the
 * code it goes by. Which rows appear depends on the level — a region lists its
 * provinces, a province its region and capital, a city its province — so NCR,
 * a region in the province tier, reads as a region rather than as a province
 * with its fields left blank.
 */
function PlaceFacts({
  profile,
}: {
  profile: ReturnType<typeof usePlaceProfile>;
}) {
  if (profile.status === "idle" || profile.status === "loading") {
    return <FactsSkeleton rows={6} label="Loading place details…" />;
  }
  if (profile.status === "error") {
    return <Notice>Place details unavailable.</Notice>;
  }
  if (profile.status === "none") {
    return <Notice>No details recorded for this place.</Notice>;
  }

  const {
    place,
    region,
    province,
    capital,
    provinces,
    cities,
    municipalities,
  } = profile.data;
  // A region or a province holds cities and municipalities; anything below
  // does not, and a pair of zeros would read as a fact about it.
  const holdsUnits = place.geoLevel === "Reg" || place.geoLevel === "Prov";
  const facts = compact([
    province && { term: "Province", value: province.name },
    region && { term: "Region", value: region.name },
    place.islandGroup && { term: "Island group", value: place.islandGroup },
    capital && { term: "Capital", value: capital.name },
    !holdsUnits &&
      place.capital && { term: "Status", value: "Provincial capital" },
    holdsUnits && { term: "Cities", value: count(cities), mono: true },
    holdsUnits && {
      term: "Municipalities",
      value: count(municipalities),
      mono: true,
    },
    place.oldName && { term: "Formerly", value: place.oldName },
    { term: "PSGC", value: place.psgc, mono: true },
  ]);

  return (
    <>
      <FactList facts={facts} />
      {provinces.length > 0 && (
        // A table rather than another run of facts: the rows are the region's
        // provinces, each with a capital beside it, and the two columns want
        // headers that say which is which.
        <table className="mt-3 w-full text-[12px]">
          <thead>
            <tr className="border-b border-line font-cis-mono text-[10px]/3 font-medium tracking-[0.02em] text-fg-subtle">
              <th scope="col" className="px-3.5 pb-1.5 text-left font-medium">
                Provinces
              </th>
              <th scope="col" className="px-3.5 pb-1.5 text-right font-medium">
                Capital
              </th>
            </tr>
          </thead>
          <tbody>
            {provinces.map(({ province, capital }) => (
              <tr key={province.psgc} className="border-b border-line">
                <th
                  scope="row"
                  className="h-8 px-3.5 py-2 text-left font-normal text-fg-heading"
                >
                  {province.name}
                </th>
                <td className="px-3.5 py-2 text-right text-fg-body">
                  {capital?.name ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const COUNT = new Intl.NumberFormat("en-PH");
const count = (value: number) => COUNT.format(value);

type Fact = {
  term: string;
  value: string;
  /** A readout — a figure or a code — set in the mono face; names are not. */
  mono?: boolean;
  /** A value someone will want elsewhere, with a button that copies it. */
  copyable?: boolean;
};

/** The facts that apply, in order, from a list written with `&&` guards. */
const compact = (facts: readonly (Fact | false | null | "")[]): Fact[] =>
  facts.filter((fact): fact is Fact => !!fact);

/**
 * Term on the left, value on the right, one ruled row each. A value too long
 * for the line — "Cordillera Administrative Region (CAR)" beside its term in
 * the collapsed panel — wraps under itself rather than being cut.
 */
function FactList({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="border-t border-line">
      {facts.map(({ term, value, mono, copyable }) => (
        <div
          key={term}
          className="flex min-h-[33px] items-center justify-between gap-4 border-b border-line px-3.5 py-2 text-[12px]/4"
        >
          <dt className="shrink-0 text-fg-subtle">{term}</dt>
          <dd
            className={cn(
              "flex min-w-0 items-center justify-end gap-1.5 text-right text-fg-heading",
              mono && "font-cis-mono",
            )}
          >
            {/* `select-all`: one click takes the whole value, for a copy by
                hand where the button cannot write to the clipboard. */}
            <span className={cn("min-w-0", copyable && "select-all")}>
              {value}
            </span>
            {copyable && (
              <CopyButton value={value} label={`Copy ${term.toLowerCase()}`} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Copies a value, and says so with a tick for a moment after.
 *
 * The Clipboard API is only there in a secure context — https, or localhost —
 * so on the dev server opened by its LAN address the write is refused. The
 * button then stays as it was rather than claiming a copy that did not happen,
 * and the value beside it selects whole on one click (see FactList).
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={copied ? "Copied" : label}
        onClick={copy}
        className={cn(
          // Pulled into the row's padding so a 24px target does not make this
          // row taller than the ones around it.
          "-my-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-field text-fg-subtle outline-none",
          "transition-colors duration-150 hover:bg-well hover:text-fg-heading",
          "focus-visible:ring-3 focus-visible:ring-brand/50",
          "[&_svg]:size-3.5",
          copied && "text-brand hover:text-brand",
        )}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}

/** A FactList's silhouette while its one request is out. */
function FactsSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" className="border-t border-line">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
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

function SubjectHeader({
  eyebrow,
  title,
  issuedAt,
}: {
  /** What the subject is. Null while that is still being fetched. */
  eyebrow: string | null;
  title: string;
  issuedAt: string | null;
}) {
  return (
    <div className="px-3.5 pt-3 pb-2.5">
      <div className="flex items-baseline justify-between gap-3 font-cis-mono text-[10px]/3 font-medium tracking-[0.02em] text-fg-subtle">
        {eyebrow !== null ? (
          <span>{eyebrow}</span>
        ) : (
          // 8px plus 2px either side: the eyebrow's own 12px line box, as in
          // the popup's.
          <Skeleton className="my-0.5 h-2 w-20 rounded-full bg-line" />
        )}
        {issuedAt && <span>Issued {formatIssuedAt(issuedAt)}</span>}
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
function TableSkeleton({
  rows,
  label = "Loading forecast…",
}: {
  rows: number;
  label?: string;
}) {
  return (
    <div role="status" className="border-t border-line">
      <span className="sr-only">{label}</span>
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

/**
 * The charts' silhouette while their data is out: the card's outline and, per
 * chart, a title and a plot, so the panel is already about the height it is
 * about to be.
 */
function ChartSkeleton({ charts }: { charts: number }) {
  return (
    <div role="status" className="border-t border-line px-2.5 pb-2.5">
      <span className="sr-only">Loading charts…</span>
      <div className="flex h-10 items-center gap-2">
        <Skeleton className="size-4 rounded-full bg-line" />
        <Skeleton className="h-2.5 w-16 rounded-full bg-line" />
      </div>
      <div className="overflow-hidden rounded-md border border-line">
        {Array.from({ length: charts }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 border-b border-line px-3 pt-2.5 pb-3 last:border-b-0"
          >
            <Skeleton className="h-2.5 w-24 rounded-full bg-line" />
            <Skeleton className="h-2 w-40 rounded-full bg-line" />
            <Skeleton className="mt-1 h-36 w-full rounded-sm bg-line/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
