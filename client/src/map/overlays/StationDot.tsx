import { cn } from "@/lib/utils";
import { inkOn, isPale } from "@/map/utils/ink";
import type { StripSegment } from "./StationPill";

/**
 * A station's reading as a disc in its class colour — the map-first
 * alternative to the pill (see mapSettingsContext `StationMarkerStyle`).
 *
 * Where the pill is a card to be read, this is a mark to be scanned: the class
 * is the whole fill rather than an edge, so seventy of them read as a pattern
 * from national zoom without clustering thinning them out. The figure is set
 * inside in whichever of black or white contrasts more with the fill (see
 * utils/ink), and the name moves to the tooltip, which is what a card this size
 * has no room for.
 *
 * The halo is the panel's own solid colour — white in the light theme, near
 * black in the dark one — so every disc is cut out of the raster beneath it by
 * the same edge the chrome is drawn in, whatever the fill.
 *
 * The tercile layer draws a pie instead: three slices, each as large as its
 * probability and coloured on its own tercile's scale, with no figure — a
 * number inside would sit across the slices it is meant to summarise.
 */

const NO_VALUE = "—";

export type StationDotProps = {
  /** The value as printed, or null for a station with no reading this month. */
  value: string | null;
  unit?: string;
  /** The class colour, the disc's fill. */
  color?: string;
  /** The terciles; present, the disc is drawn as a pie of them. */
  strip?: readonly StripSegment[];
  /** The station's own name, for the accessible name. */
  name: string;
  /** The full name, for the tooltip. */
  title?: string;
  loading?: boolean;
  onClick?: () => void;
  selected?: boolean;
};

export function StationDot({
  value,
  unit,
  color,
  strip,
  name,
  title,
  loading = false,
  onClick,
  selected = false,
}: StationDotProps) {
  const Root = onClick ? "button" : "div";
  const pie = !loading && strip?.length ? strip : null;
  // Nothing on the face names the station or, for a pie, the figure, so both
  // go to the tooltip and the accessible name.
  const reading = value === null ? "no reading" : unit ? `${value} ${unit}` : value;
  const fill = !loading && !pie ? color : undefined;

  return (
    <Root
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={`${title ?? name} · ${reading}`}
      aria-label={`${name}: ${reading}`}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        "pointer-events-auto relative flex size-7 items-center justify-center",
        "rounded-full font-cis shadow-float",
        // The halo. A ring rather than a border so it sits outside the fill
        // and the pie's slices run to the disc's true edge. The selected
        // station swaps it for the brand, as the pill swaps its border.
        selected ? "ring-[2.5px] ring-brand" : "ring-2 ring-panel-solid",
        fill ? undefined : "bg-line",
        fill && isPale(fill) && "border border-line-strong",
        loading && "animate-pulse motion-reduce:animate-none",
        onClick
          ? cn(
              "cursor-pointer outline-none",
              "transition-transform duration-150 ease-strong-out hover:scale-110",
              "motion-reduce:transition-none motion-reduce:hover:scale-100",
              "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/50",
            )
          : "cursor-default",
      )}
      style={fill ? { backgroundColor: fill } : undefined}
    >
      {pie ? (
        <TercilePie segments={pie} />
      ) : loading ? null : (
        <span
          className={cn(
            "font-cis-mono leading-none font-semibold tracking-tighter",
            figureSize(value),
            !fill && "text-fg-subtle",
          )}
          style={fill ? { color: inkOn(fill) } : undefined}
        >
          {value ?? NO_VALUE}
        </span>
      )}
    </Root>
  );
}

/**
 * The figure's size, stepped down as it lengthens so it stays inside the disc.
 * Most published figures are four characters — `112%`, `27.4`, `+0.6`, `1234`.
 */
function figureSize(value: string | null): string {
  const length = value?.length ?? 1;
  if (length <= 3) return "text-[10px]";
  if (length === 4) return "text-[9px]";
  return "text-[8px]";
}

/**
 * The slices, clockwise from twelve o'clock in the order the strip lists them,
 * on a unit circle so the arithmetic needs no radius.
 *
 * Separated by a hairline of the halo colour, so two neighbouring slices of
 * similar colour still read as two.
 */
function TercilePie({ segments }: { segments: readonly StripSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.share, 0);
  if (total <= 0) return null;

  let start = 0;
  const slices = segments.flatMap((segment, index) => {
    const fraction = segment.share / total;
    const from = start;
    start += fraction;
    if (fraction <= 0) return [];

    // A slice that is the whole pie has no arc to draw: its two ends coincide,
    // and an SVG arc between the same two points draws nothing.
    if (fraction >= 1) {
      return [<circle key={index} r={1} fill={segment.color} />];
    }

    const [x0, y0] = pointAt(from);
    const [x1, y1] = pointAt(from + fraction);
    const large = fraction > 0.5 ? 1 : 0;
    return [
      <path
        key={index}
        d={`M0 0L${x0} ${y0}A1 1 0 ${large} 1 ${x1} ${y1}Z`}
        fill={segment.color}
        className="stroke-panel-solid"
        strokeWidth={1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />,
    ];
  });

  return (
    <svg
      aria-hidden
      viewBox="-1 -1 2 2"
      className="absolute inset-0 size-full overflow-hidden rounded-full"
    >
      {slices}
    </svg>
  );
}

/** The point on the unit circle a fraction of the way round from twelve. */
function pointAt(fraction: number): [number, number] {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return [Math.cos(angle), Math.sin(angle)];
}
