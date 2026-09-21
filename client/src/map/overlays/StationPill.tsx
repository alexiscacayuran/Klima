import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A station's reading, as a card small enough to sit on the map at its own
 * position.
 *
 * The popup in LocationPopup at a quarter of the size: the same hairline, float
 * shadow and mono figure, so a user who has read one card knows how to read
 * seventy. What it drops is everything a popup has room for and a marker does
 * not — the eyebrow, the disclosure, the class name in words.
 *
 * Where it parts company is how it carries the class colour. The popup sets a
 * swatch beside its number, because it is a panel with room for the class as
 * one more fact. A pill has no such room — a square inline with the figure eats
 * a real share of a card this size to say one thing, and pushes the number off
 * the left edge the names above it align to.
 *
 * So the colour moves to the edge: a strip down the right side, flush to it and
 * full height. It reads at a glance across seventy markers, which is what makes
 * the classification legible as a *pattern* rather than as seventy separate
 * facts, and it costs five pixels of width instead of a swatch plus its gap.
 * The right side rather than the left because the text is ragged-right: a strip
 * there closes the card against the uneven edge, where on the left it would
 * fight the alignment the two lines already share.
 *
 * The fill stays the panel token. Painting the whole card in its class colour
 * was the other way to do this and is worse here: on the rainfall layers the
 * pill would agree with the raster beneath it and dissolve into it, and the
 * text would need a computed ink to stay legible across a palette running from
 * near-white to pure black.
 *
 * `rounded-field` rather than `rounded-panel`: the CIS tokens put 8px on panels
 * and cards and 6px on inputs and badges, and at this size the larger radius
 * eats the corners.
 */

const NO_VALUE = "—";

/**
 * One band of a strip split between several classes: its colour, and its share
 * of the strip's height. Shares are relative, so they need not sum to 100.
 */
export type StripSegment = {
  color: string;
  share: number;
};

export type StationPillProps = {
  /** The value as printed, or null for a station with no reading this month. */
  value: string | null;
  /** Set apart from the number and smaller, as SeasonalReading intends. */
  unit?: string;
  /** The class colour — the same ink the scale gives every other consumer. */
  color?: string;
  /**
   * The strip split top to bottom between several classes, in place of one
   * `color`: the tercile probabilities, each band as tall as its share.
   */
  strip?: readonly StripSegment[];
  /** The station's own name, without the places that locate it. */
  name: string;
  /** The full name, for a pointer that rests on the pill. */
  title?: string;
  /**
   * The station is placed but its reading has not arrived. Distinct from a null
   * value, which is a station with no reading this month.
   */
  loading?: boolean;
};

export function StationPill({
  value,
  unit,
  color,
  strip,
  name,
  title,
  loading = false,
}: StationPillProps) {
  return (
    <div
      title={title}
      className={cn(
        "pointer-events-auto relative max-w-[8.5rem] cursor-default",
        // `overflow-hidden` is what gives the strip the card's own corners:
        // it is a plain rectangle, and the radius clipping it is this one.
        "overflow-hidden rounded-field",
        "border border-line bg-panel-strong py-1 pr-3 pl-1.5 font-cis",
        "shadow-float backdrop-blur-md",
      )}
    >
      <p className="truncate text-[9px]/3 text-fg-body">{name}</p>
      {loading ? (
        // The figure's own 12px line box, so the pill does not resize when the
        // number lands.
        <div className="mt-0.5 flex h-3 items-center">
          <Skeleton className="h-2 w-10 rounded-full bg-line" />
        </div>
      ) : (
        <p className="font-cis-mono mt-0.5 text-[11px]/3 font-semibold tracking-tight text-fg-heading">
          {value ?? NO_VALUE}
          {value !== null && unit && (
            <span className="ml-0.5 text-[9px] font-medium text-fg-subtle">
              {unit}
            </span>
          )}
        </p>
      )}
      {/*
        The class, as an edge rather than an object. Absolutely positioned so it
        spans the full height whatever the two lines come to, and so it costs the
        text no room beyond the padding held back for it.

        A station with no reading this month gets the hairline colour, not a
        class colour and not nothing: every pill keeps the same silhouette, and
        the absent band reads as "unclassified" rather than as a different kind
        of marker.

        A split strip keeps the same box and divides it: flex-grow by share, so
        the bands fill the height in proportion whatever the shares sum to.
      */}
      {strip?.length ? (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 flex w-[5px] flex-col"
        >
          {strip.map((segment, index) => (
            <span
              key={index}
              className="min-h-0"
              style={{ flexGrow: segment.share, backgroundColor: segment.color }}
            />
          ))}
        </span>
      ) : (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-[5px]"
          style={{ backgroundColor: color ?? "var(--cis-line)" }}
        />
      )}
    </div>
  );
}

/**
 * A group of stations the map has not got room to draw separately.
 *
 * A disc with a count in it, and nothing else — deliberately not a small
 * version of the card beside it. A station pill is a *reading*: it has a value,
 * a unit, a class colour and a name, and its rectangle is the shape of a card
 * carrying those. A cluster has none of them. A mean across stations is not a
 * number CIS publishes and not one any of these stations forecast
 * (config/seasonalReadings is pointed about not inventing those), so the only
 * honest content is how many there are.
 *
 * Giving that a different silhouette is what stops it being misread. Two
 * rectangles of the same ink invite comparison — `19` beside `235 mm` looks
 * like a quantity of the same kind — where a circle reads as a tally and as
 * something to open. The readings are one zoom away, which is what clicking it
 * does.
 *
 * Fixed size rather than scaled by count: 73 stations is the national total, so
 * the number never exceeds two digits, and a disc that grew with its contents
 * would encode magnitude the clustering radius already decides arbitrarily.
 */
export type StationClusterPillProps = {
  count: number;
  onClick: () => void;
};

export function StationClusterPill({
  count,
  onClick,
}: StationClusterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The word the face drops has to survive somewhere: a screen reader gets
      // "19 stations", not the bare number the sighted reader can infer from a
      // disc sitting on a map.
      aria-label={`${count} stations — zoom in`}
      className={cn(
        "pointer-events-auto flex size-5 cursor-pointer items-center justify-center",
        "rounded-full border border-line bg-panel-strong font-cis",
        "shadow-float backdrop-blur-md",
        "transition-colors duration-150 hover:border-brand-medium",
        "focus-visible:ring-3 focus-visible:ring-brand/50 focus-visible:outline-none",
      )}
    >
      {/* `leading-none`, not the `/3` line box the card's figures use: those are
          stacked against a second line and need a predictable rhythm, while this
          one is centred in a circle and any leading at all pushes it off. */}
      <span className="font-cis-mono text-[11px] leading-none font-semibold tracking-tight text-fg-heading">
        {count}
      </span>
    </button>
  );
}
