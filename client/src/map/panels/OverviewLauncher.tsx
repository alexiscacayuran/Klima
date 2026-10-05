import { useMemo } from "react";
import type { ReactNode } from "react";
import { LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { cisProductForVariable } from "@/map/config/products";
import { choroplethMonth, useChoropleth } from "@/map/hooks/useChoropleth";
import { useSelection } from "@/map/state/useSelection";
import { useSidePanels } from "@/map/state/useSidePanels";
import { ClassDonut } from "./charts/ClassDonut";
import {
  classCounts,
  droughtClassing,
  droughtUnits,
  leadClass,
  PN_CLASSING,
} from "./overviewSummary";
import type { ClassCount } from "./overviewSummary";
import { useOverviewUnits } from "./useOverviewUnits";

export type OverviewLauncherProps = {
  /** A panel is up over it: faded out and inert (see `.panel-launcher`). */
  covered: boolean;
  onClick: () => void;
  /** Placement in the dock. */
  className?: string;
};

/**
 * The button the empty right-hand slot leaves behind, which brings the
 * overview back (see PanelDock) — faced with what the overview would say about
 * the selected product, so it is worth a glance before it is pressed.
 *
 * Per product, as the overview's content is. The seasonal forecast's face and
 * the drought layers' are the panel's class donut in miniature, its lead class
 * counted in the hole — by its code too, where the scale publishes one — in a
 * round frame. A product the overview has nothing to summarise for keeps the
 * plain icon.
 *
 * A different component per face, so a product's data hooks only run while
 * that product is selected: the seasonal one would otherwise fetch the
 * seasonal station directory under every product.
 */
export function OverviewLauncher(props: OverviewLauncherProps) {
  const { variable } = useSelection();
  const product = cisProductForVariable(variable);
  return product === "seasonal" ? (
    <SeasonalLauncher {...props} />
  ) : product === "drought" ? (
    <DroughtLauncher {...props} />
  ) : (
    <IconLauncher {...props} />
  );
}

function IconLauncher(props: OverviewLauncherProps) {
  return (
    <LauncherButton {...props} label="Open overview" title="Overview">
      {OVERVIEW_ICON}
    </LauncherButton>
  );
}

/**
 * The scrubbed month's split at the resolution the overview was last showing,
 * from the same counts the panel draws — so the button and the panel it opens
 * cannot disagree.
 */
function SeasonalLauncher(props: OverviewLauncherProps) {
  const { date } = useSelection();
  const { overviewSource: source } = useSidePanels();
  const units = useOverviewUnits(date).units[source];
  const classes = useMemo(
    () => units && classCounts(units, PN_CLASSING),
    [units],
  );
  return <ClassLauncher {...props} classes={classes} noun={source} />;
}

/**
 * The scrubbed month's drought statuses, from the national fetch the map is
 * painted from and the panel counts.
 */
function DroughtLauncher(props: OverviewLauncherProps) {
  const { date } = useSelection();
  const choropleth = useChoropleth();
  const month = choropleth ? choroplethMonth(choropleth, date) : null;
  const variant = choropleth?.variant;
  const classes = useMemo(
    () =>
      month && variant
        ? classCounts(droughtUnits(month), droughtClassing(variant.classes))
        : null,
    [month, variant],
  );
  return <ClassLauncher {...props} classes={classes} noun="provinces" />;
}

/**
 * A month's class counts as a donut. Until there is something to count, or
 * with nothing in the month, it is the plain icon, on the same element so it
 * grows into the chart rather than being replaced by it.
 */
function ClassLauncher({
  classes,
  noun,
  ...props
}: OverviewLauncherProps & {
  /** Null until there is something to count. */
  classes: ClassCount[] | null;
  /** What is counted, for the summary: "provinces". */
  noun: string;
}) {
  const total = classes?.reduce((sum, each) => sum + each.count, 0) ?? 0;

  if (!classes || total === 0)
    return (
      <LauncherButton {...props} label="Open overview" title="Overview">
        {OVERVIEW_ICON}
      </LauncherButton>
    );

  const lead = leadClass(classes);
  const summary = `${lead.count} of ${total} ${noun} ${lead.phrase}`;
  return (
    <LauncherButton
      {...props}
      label={`Open overview: ${summary}`}
      title={`Overview · ${summary}`}
      chart
    >
      <ClassDonut
        classes={classes}
        lead={lead}
        // About a pixel at this size, as the panel's donut's 1 is at 192.
        strokeWidth={4}
        // 56px rather than the header's 44: the smallest donut whose hole
        // holds a two-digit count at 15px and its code at 10px clear of the
        // ring.
        className="size-14"
      >
        <span className="font-cis-mono text-[15px]/none font-semibold tracking-[-0.02em] text-fg-heading">
          {lead.count}
        </span>
        {lead.tag && (
          <span className="mt-0.5 font-cis-mono text-[10px]/none font-medium tracking-[0.02em] text-fg-body">
            {lead.tag}
          </span>
        )}
      </ClassDonut>
    </LauncherButton>
  );
}

const OVERVIEW_ICON = <LayoutList aria-hidden className="size-[18px]" />;

/**
 * The launcher, in one of two dresses.
 *
 * The icon face wears the panel's frame — its fill, hairline and radius, at
 * the header's own 44px — so it stands exactly where the header it replaces
 * did, and the panel growing out of it reads as the same object.
 *
 * The chart face wears the same fill and hairline, drawn round to wrap the
 * donut rather than boxing a round thing in a square. The fill lifts the count
 * off whatever the map is drawing beneath, and gives the slices' cuts, which
 * are drawn in the panel's colour, the surface they were drawn for. The frame
 * sits 8px past the donut, and is the button's hit area and focus ring.
 */
function LauncherButton({
  covered,
  onClick,
  label,
  title,
  chart = false,
  className,
  children,
}: OverviewLauncherProps & {
  label: string;
  title: string;
  /** A chart face: framed round, and it swells under the pointer (see `.panel-launcher`). */
  chart?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      data-closed={covered || undefined}
      data-face={chart ? "chart" : undefined}
      inert={covered}
      className={cn(
        "panel-launcher pointer-events-auto flex shrink-0 items-center justify-center",
        "cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-brand/50",
        "border border-line bg-panel shadow-panel backdrop-blur-md hover:border-brand-medium",
        chart
          ? "size-16 rounded-full"
          : "size-11 rounded-panel text-fg-body hover:text-fg-heading",
        className,
      )}
    >
      {children}
    </button>
  );
}
