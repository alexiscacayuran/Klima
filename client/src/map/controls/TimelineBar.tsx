import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimelineStep } from "@/map/config/timeline";
import { cn } from "@/lib/utils";

type TimelineBarProps = {
  /**
   * The window, in the order it should be printed — which is not always
   * chronological: a monitoring product runs from its newest observation
   * backwards. This component lays out whatever order it is given and does not
   * sort, because the order is a property of the product (see
   * config/timeline.ts PRODUCT_TIMELINES).
   *
   * Must be referentially stable across renders (a module constant or a
   * useMemo) — it is a dependency of the playback timer, and a fresh array
   * every render restarts it.
   */
  steps: readonly TimelineStep[];
  /** Id of the selected step; null before the window has resolved. */
  value: string | null;
  onChange: (stepId: string) => void;
  /**
   * What to say when there are no steps. The bar keeps its box either way —
   * the chrome is absolutely positioned and a disappearing panel would shift
   * nothing but would leave the map looking like it had lost a control.
   */
  placeholder?: string;
  /**
   * The window is still being fetched. Draws skeleton ticks along the track in
   * place of the placeholder text, which is kept for screen readers only.
   */
  loading?: boolean;
  /** How long each step is held while playing. */
  stepDurationMs?: number;
  className?: string;
};

/**
 * Half the track's thickness, in px.
 *
 * The rail the ticks are laid along is inset by this much at both ends, which
 * is what lets the first and last tick sit on the centres of the track's
 * rounded caps: as far apart as they can go while still being *inside* the
 * track. Shared by the tick rail and the fill's calc so the two cannot drift.
 */
const RAIL_INSET = 8;

/** How many placeholder ticks the loading state lays along the track. */
const SKELETON_TICKS = 6;

/**
 * The visual shift that pulls an end label flush with the end of the track.
 *
 * Labels are centred on their ticks, and the end ticks sit on the rail, which
 * is RAIL_INSET short of the track at both ends. Half the label's own width
 * brings its outer edge onto the tick; RAIL_INSET more brings it onto the end
 * of the track. `translate` is visual only, so the tick under it stays put.
 */
function endLabelStyle(index: number, lastIndex: number) {
  if (lastIndex <= 0) return undefined;
  if (index === 0) return { translate: `calc(50% - ${RAIL_INSET}px)` };
  if (index === lastIndex) return { translate: `calc(-50% + ${RAIL_INSET}px)` };
  return undefined;
}

/**
 * Scrubber for the selected product's window under the map.
 *
 * The ticks are buttons, not a range input: they are a handful of labelled
 * dates, not a continuous scale, and a native slider would announce "2 of 6"
 * instead of "October 2026". `aria-current` marks the painted step, which is
 * what a screen reader user needs to hear on arrival, and each tick carries its
 * date in full as its accessible name — the visible label abbreviates, and
 * prints the year only where it changes, which is unambiguous next to its
 * neighbours but not to someone landing on one tick alone.
 *
 * Playback walks to the last step and stops, deliberately — the CIS motion
 * rules forbid infinite loops on content, and a map that quietly restarts is a
 * map you cannot read a value off. Pressing play at the end replays from the
 * start.
 *
 * The selected step is the caller's state, so playback drives the same value
 * a click does and the map has one source of truth.
 *
 * Geometrically it is a scale, not a row of columns: the steps are anchored to
 * the ends of the track and spaced between, which is why they are absolutely
 * positioned rather than laid out in a grid. The track is thick enough to hold
 * the ticks, and the steps behind the playhead are dropped — the fill has
 * taken that stretch and says where playback has reached.
 *
 * "Forward" here means along the array, not forward in time. A product whose
 * window runs from its newest observation backwards plays into the past, which
 * is the direction its own data reads in.
 */
export function TimelineBar({
  steps,
  value,
  onChange,
  placeholder = "No dates available",
  loading = false,
  stepDurationMs = 1200,
  className,
}: TimelineBarProps) {
  const [playing, setPlaying] = useState(false);

  // Held in a ref so an inline arrow function from the caller does not count as
  // a timer dependency; otherwise every parent render would cancel and restart
  // the current step's dwell, and playback would stall.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const activeIndex = steps.findIndex((step) => step.id === value);
  const lastIndex = steps.length - 1;
  const isLast = activeIndex === lastIndex;
  // No window to scrub: the catalogue has not landed, the API is unreachable,
  // or CIS publishes no dates for the selected bulletin. The caller's
  // placeholder says which.
  const isEmpty = steps.length === 0;

  useEffect(() => {
    if (!playing) return;
    if (activeIndex === -1 || activeIndex >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const next = steps[activeIndex + 1].id;
    const timer = setTimeout(() => onChangeRef.current(next), stepDurationMs);
    return () => clearTimeout(timer);
  }, [playing, activeIndex, steps, stepDurationMs]);

  const togglePlay = () => {
    // From the end there is nothing left to play, so play means replay.
    if (!playing && isLast && steps.length > 0) onChange(steps[0].id);
    setPlaying((current) => !current);
  };

  // Tick n's centre, as a percentage of the rail. Edge-anchored — n / (count-1)
  // rather than the (n + 0.5) / count a column layout gives — so the first and
  // last steps land on the ends of the track instead of floating in from them.
  const positionOf = (index: number) =>
    lastIndex <= 0 ? 0 : (index / lastIndex) * 100;

  // The fill runs to the centre of the active knob rather than to its leading
  // edge, so the two agree about where "now" is; it is measured against the
  // rail, not the track, hence the inset in the calc. The first step is 0% by
  // definition — the sliver of fill that would otherwise peek out from under
  // the knob at the left cap reads as an artefact, not as progress.
  const fillWidth =
    activeIndex <= 0
      ? "0px"
      : `calc(${RAIL_INSET}px + (100% - ${RAIL_INSET * 2}px) * ${
          activeIndex / lastIndex
        })`;

  return (
    <div
      className={cn(
        "pointer-events-auto flex h-[72px] items-center gap-5 rounded-panel",
        "border border-line bg-panel-strong px-5 font-cis shadow-float backdrop-blur-md",
        className,
      )}
    >
      <Button
        onClick={togglePlay}
        disabled={isEmpty}
        aria-label={
          playing ? "Pause the forecast sequence" : "Play the forecast sequence"
        }
        className={cn(
          "size-10 shrink-0 rounded-full bg-brand text-white shadow-glint",
          "hover:bg-brand-strong focus-visible:ring-brand-medium",
          // Kept in the layout rather than hidden while there is nothing to
          // play: the bar's proportions are what make it recognisable as a
          // scrubber, and a control that vanishes and returns reads as a
          // glitch where a dimmed one reads as "not yet".
          "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
        )}
      >
        {/* Nudged off-centre: a triangle's optical centre sits left of its
            bounding box, so a centred play glyph reads as leaning back. */}
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 translate-x-px fill-current" />
        )}
      </Button>

      {/* 38px: a 16px label row, a 6px gap, and the 16px track under both. */}
      <div className="relative h-[36px] flex-1">
        {/* The track is as thick as the ticks it carries, so a tick reads as
            something seated in the track rather than a bead on a wire. */}
        <div className="absolute inset-x-0 bottom-0 h-4 rounded-full bg-line" />
        <div
          className="absolute bottom-0 left-0 h-4 rounded-full bg-brand transition-[width] duration-150"
          style={{ width: fillWidth }}
        />

        {/* The empty track stays under it, so what is missing reads as dates
            rather than as the whole control. `role="status"` because this text
            replaces itself as the catalogue resolves — a screen reader user who
            has already passed the bar should hear that it filled in. */}
        {isEmpty && (
          <p
            role="status"
            className={cn(
              "absolute inset-x-0 top-0 font-cis-mono text-xs/4 text-fg-subtle",
              loading && "sr-only",
            )}
          >
            {placeholder}
          </p>
        )}

        {/* While the window is in flight, the shape of a scale rather than a
            sentence about one: label and dot placeholders laid out exactly as
            real ticks would be, so the bar does not rearrange itself when the
            dates land. The count is a stand-in — the real one is not known
            until the catalogue is. */}
        {isEmpty && loading && (
          <div
            aria-hidden
            className="absolute inset-y-0"
            style={{ left: RAIL_INSET, right: RAIL_INSET }}
          >
            {Array.from({ length: SKELETON_TICKS }, (_, index) => {
              const last = SKELETON_TICKS - 1;
              return (
                <div
                  key={index}
                  style={{ left: `${(index / last) * 100}%` }}
                  className="absolute inset-y-0 flex -translate-x-1/2 flex-col items-center justify-between"
                >
                  <div className="flex h-4 items-center">
                    <Skeleton
                      className="h-2.5 w-7 rounded-full bg-line-strong"
                      style={endLabelStyle(index, last)}
                    />
                  </div>
                  <div className="flex size-4 items-center justify-center">
                    <Skeleton className="size-2 rounded-full bg-line-strong" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* The rail: the track minus a cap at each end. Ticks are positioned
            against this box, so 0% and 100% are the ends of the *track*. */}
        <div
          className="absolute inset-y-0"
          style={{ left: RAIL_INSET, right: RAIL_INSET }}
        >
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            // Steps already stepped past are not drawn. The fill has taken
            // that stretch of track, and a tick sitting on it would only ask
            // to be read as a second, contradictory position marker.
            const isPast = activeIndex !== -1 && index < activeIndex;
            return (
              <button
                key={step.id}
                type="button"
                // The full date, not the tick's own text: the label abbreviates
                // and prints the year only where it changes, which reads
                // correctly along the rail but leaves a screen reader landing
                // on a bare "Nov" with no year and no month for a bare "8".
                aria-label={step.fullLabel}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  setPlaying(false);
                  onChange(step.id);
                }}
                // px-3 widens the hit target either side of a ~22px label
                // without moving it: the padding is symmetric, so the centring
                // transform still lands the tick on its position.
                style={{ left: `${positionOf(index)}%` }}
                className={cn(
                  "absolute inset-y-0 flex -translate-x-1/2 flex-col items-center",
                  "justify-between rounded-field px-3 outline-none",
                  "focus-visible:ring-3 focus-visible:ring-brand/50",
                )}
              >
                <span
                  className={cn(
                    "font-cis-mono text-xs/4 whitespace-nowrap",
                    isActive
                      ? "font-semibold text-fg-heading"
                      : "text-fg-subtle",
                  )}
                  // The end labels align to the ends of the track rather than
                  // hanging half off their ticks — see endLabelStyle.
                  style={endLabelStyle(index, lastIndex)}
                >
                  {step.label}
                </span>
                {/* A slot the thickness of the track, so every tick sits on the
                    track's centre line whatever size it is. The active one is
                    wider than the slot and overflows it evenly; `shrink-0`
                    stops the flex row squeezing it back to 16px. */}
                <span className="flex size-4 items-center justify-center">
                  <span
                    className={cn(
                      "shrink-0 rounded-full",
                      // 20px against the 16px track: the active tick stands
                      // proud of it on both edges, which is what marks the
                      // playhead where the fill's own colour cannot — it is
                      // brand on brand along the stretch already played.
                      isActive ? "size-5 bg-white" : "size-2 bg-line-strong",
                      isPast && "invisible",
                    )}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
