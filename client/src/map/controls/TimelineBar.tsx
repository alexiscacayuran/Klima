import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TimelineStep = {
  /** Stable id — the value the caller stores and the API is queried with. */
  id: string;
  /** Short label under the tick ("Oct"). */
  label: string;
};

type TimelineBarProps = {
  /**
   * The months in the window, in order. Must be referentially stable across
   * renders (a module constant or a useMemo) — it is a dependency of the
   * playback timer, and a fresh array every render restarts it.
   */
  steps: readonly TimelineStep[];
  /** Id of the selected step. */
  value: string;
  onChange: (stepId: string) => void;
  /** How long each month is held while playing. */
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

/**
 * Scrubber for the forecast window under the map.
 *
 * The ticks are buttons, not a range input: they are six labelled months, not a
 * continuous scale, and a native slider would announce "2 of 6" instead of
 * "October". `aria-current` marks the painted month, which is what a screen
 * reader user needs to hear on arrival.
 *
 * Playback walks to the last month and stops, deliberately — the CIS motion
 * rules forbid infinite loops on content, and a map that quietly restarts is a
 * map you cannot read a value off. Pressing play at the end replays from the
 * start.
 *
 * The selected month is the caller's state, so playback drives the same value
 * a click does and the map has one source of truth.
 *
 * Geometrically it is a scale, not a row of columns: the months are anchored to
 * the ends of the track and spaced between, which is why they are absolutely
 * positioned rather than laid out in a grid. The track is thick enough to hold
 * the ticks, and the months behind the playhead are dropped — the fill has
 * taken that stretch and says where playback has reached.
 */
export function TimelineBar({
  steps,
  value,
  onChange,
  stepDurationMs = 1200,
  className,
}: TimelineBarProps) {
  const [playing, setPlaying] = useState(false);

  // Held in a ref so an inline arrow function from the caller does not count as
  // a timer dependency; otherwise every parent render would cancel and restart
  // the current month's dwell, and playback would stall.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const activeIndex = steps.findIndex((step) => step.id === value);
  const lastIndex = steps.length - 1;
  const isLast = activeIndex === lastIndex;

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
  // last months land on the ends of the track instead of floating in from them.
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
        aria-label={
          playing ? "Pause the forecast sequence" : "Play the forecast sequence"
        }
        className={cn(
          "size-10 shrink-0 rounded-full bg-brand text-white shadow-glint",
          "hover:bg-brand-strong focus-visible:ring-brand-medium",
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

        {/* The rail: the track minus a cap at each end. Ticks are positioned
            against this box, so 0% and 100% are the ends of the *track*. */}
        <div
          className="absolute inset-y-0"
          style={{ left: RAIL_INSET, right: RAIL_INSET }}
        >
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            // Months already stepped past are not drawn. The fill has taken
            // that stretch of track, and a tick sitting on it would only ask
            // to be read as a second, contradictory position marker.
            const isPast = activeIndex !== -1 && index < activeIndex;
            return (
              <button
                key={step.id}
                type="button"
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
                    // The end labels are centred on ticks that sit on the ends
                    // of the rail, so half of each would hang off it. Sliding
                    // one in by half its own width aligns it to the end
                    // instead; the transform is visual only, so the tick below
                    // stays where it is.
                    index === 0 && lastIndex > 0 && "translate-x-1/2",
                    index === lastIndex && lastIndex > 0 && "-translate-x-1/2",
                  )}
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
