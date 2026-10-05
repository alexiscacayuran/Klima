import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTween } from "@/map/hooks/useTween";
import { easeStrongInOut, easeStrongOut } from "@/map/utils/easing";
import { isPale } from "@/map/utils/ink";
import type { ClassCount } from "../overviewSummary";

/**
 * Class counts as a donut, the lead class pulled out, with whatever the caller
 * gives it centred in the hole.
 *
 * One component for the overview's class section — percent of normal, drought
 * status — and the dock's button that stands in for the panel (see
 * OverviewLauncher), so the button is the same chart in miniature rather than
 * a drawing of it. It fills the box
 * its `className` sizes; the geometry is drawn in a 192-unit viewBox and
 * scales with it.
 *
 * The slices morph to each new month or resolution rather than redrawing: the
 * counts and the lead's reach tween together, so a class growing reads as its
 * slice growing. On mount the ring sweeps round once instead.
 */
export function ClassDonut({
  classes,
  lead,
  label,
  strokeWidth = 1,
  className,
  children,
}: {
  classes: readonly ClassCount[];
  /** The class pulled out — one of `classes`. */
  lead: ClassCount;
  /**
   * The chart's accessible name. Without one it is decoration of whatever
   * holds it — hidden from assistive technology, and its slices carry no
   * tooltips to compete with their holder's.
   */
  label?: string;
  /**
   * The cut between slices, in viewBox units. A smaller donut wants a wider
   * one, or the cuts shrink with it until they vanish.
   */
  strokeWidth?: number;
  className?: string;
  /** Drawn over the hole, centred. */
  children?: ReactNode;
}) {
  const shape = useTween(
    [
      ...classes.map((each) => each.count),
      ...classes.map((each) => (each === lead ? LEAD_RADIUS : RING_RADIUS)),
    ],
    { duration: 250, easing: easeStrongInOut },
  );
  const [sweep] = useTween([1], {
    duration: 300,
    easing: easeStrongOut,
    initial: [0],
  });

  return (
    <div className={cn("relative shrink-0", className)}>
      <svg
        viewBox="0 0 192 192"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className="block size-full"
      >
        {donutSlices(
          classes,
          shape.slice(0, classes.length),
          shape.slice(classes.length),
          sweep,
        )
          // Pale slices first, so where a wide stroke spills an edge into
          // the gap, the neighbour's cut is painted over it rather than under.
          .sort((a, b) => Number(isPale(b.color)) - Number(isPale(a.color)))
          .map((slice) => (
            <path
              key={slice.label}
              d={slice.d}
              fill={slice.color}
              // The panel's own colour, so the gaps between slices read as
              // cuts rather than as a fifth colour. A pale slice — drought's
              // "Not affected" is published as white — is edged instead, or
              // it is not there on a white panel.
              stroke={
                isPale(slice.color)
                  ? "var(--cis-line-strong)"
                  : "var(--cis-panel-solid)"
              }
              strokeWidth={strokeWidth}
            >
              {label && <title>{`${slice.label}: ${slice.count}`}</title>}
            </path>
          ))}
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/** The ring's outer edge, and the lead class's, which reaches further out. */
const RING_RADIUS = 82;
const LEAD_RADIUS = 92;
const INNER_RADIUS = 58;

/**
 * The donut's slices, clockwise from twelve o'clock in the scale's order, from
 * the tweened counts and outer radii (see ClassDonut). `sweep` is how much of
 * the turn is drawn, 0 to 1, for the entrance. A slice too thin to clear the
 * gaps either side of it — an empty class, or one shrinking away — draws
 * nothing.
 */
function donutSlices(
  classes: readonly ClassCount[],
  counts: readonly number[],
  radii: readonly number[],
  sweep: number,
) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return [];
  const spans = counts.map((count) => (count / total) * Math.PI * 2 * sweep);
  // A hairline of angle between slices, and none around a lone full circle,
  // which would otherwise show a notch at the top.
  const gap = counts.filter((count) => count > 0).length > 1 ? 0.025 : 0;
  let start = 0;
  return classes.flatMap((each, index) => {
    // Shy of a full turn, so a single class is still an arc SVG can draw.
    const span = spans[index] - 0.0001;
    const from = start;
    start += span;
    if (span <= gap) return [];
    return [
      {
        ...each,
        d: arc(
          from + gap / 2,
          from + span - gap / 2,
          INNER_RADIUS,
          radii[index],
        ),
      },
    ];
  });
}

/** An annular sector between two angles (radians, clockwise from twelve). */
function arc(from: number, to: number, inner: number, outer: number) {
  const centre = 96;
  const at = (radius: number, angle: number) =>
    `${(centre + radius * Math.sin(angle)).toFixed(2)} ${(centre - radius * Math.cos(angle)).toFixed(2)}`;
  const large = to - from > Math.PI ? 1 : 0;
  return (
    `M${at(outer, from)}A${outer} ${outer} 0 ${large} 1 ${at(outer, to)}` +
    `L${at(inner, to)}A${inner} ${inner} 0 ${large} 0 ${at(inner, from)}Z`
  );
}
