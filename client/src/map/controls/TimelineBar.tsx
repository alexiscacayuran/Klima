import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GalleryHorizontalEnd, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TimelineStep } from "@/map/config/timeline";
import { cn } from "@/lib/utils";

/** A thumbnail of the map at each step; see `preview` on TimelineBarProps. */
export type TimelinePreview = {
  /** The map at one step. Drawn into a card, and nothing else in it. */
  render: (step: TimelineStep) => ReactNode;
  /** Width over height of what `render` draws, so every card is its shape. */
  aspect: number;
};

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
  /**
   * A snapshot of the map at each step, in a card above its tick, with a
   * toggle at the far end of the rail to show or hide the strip.
   *
   * Absent for a layer with nothing to preview — one that draws only station
   * points, say — and then neither the strip nor its toggle is drawn: a button
   * that could only ever reveal blank silhouettes is not a control.
   */
  preview?: TimelinePreview;
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
 * A preview card at its widest, in px. It narrows on a crowded rail — see
 * cardWidth — and its height always follows from the preview's aspect.
 */
const CARD_MAX_WIDTH = 64;

/** The card's padding plus its 1px border, per side, in px. */
const CARD_INSET = 4;

/** The least space kept between two neighbouring cards, in px. */
const CARD_GAP = 8;

/**
 * How long the strip takes to open or close — a slide of about 140px, so a
 * little longer than the bar's other transitions.
 */
const STRIP_TRANSITION_MS = 240;

/**
 * Space between the rail's row and the cards (room for the active card's ring,
 * which a tighter clip would shave), and below them to the bar's bottom edge.
 */
const STRIP_PADDING = { top: 2, bottom: 16 };

/**
 * A card's width: its maximum, or the spacing between two ticks less a gap,
 * whichever is smaller — so cards shrink together rather than overlap when the
 * bar is narrow or the window long. The percentage resolves against the rail,
 * which is the box the ticks are spaced along.
 */
function cardWidth(lastIndex: number) {
  return lastIndex <= 0
    ? `${CARD_MAX_WIDTH}px`
    : `min(${CARD_MAX_WIDTH}px, calc(100% / ${lastIndex} - ${CARD_GAP}px))`;
}

/** The strip's height: a card at its widest, and the padding around it. */
function stripHeight(aspect: number) {
  const map = (CARD_MAX_WIDTH - CARD_INSET * 2) / aspect;
  return STRIP_PADDING.top + map + CARD_INSET * 2 + STRIP_PADDING.bottom;
}

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
 *
 * Below the rail, when the caller supplies a `preview`, sits a strip of map
 * snapshots: one card per step, centred under its tick, the selected one
 * outlined in brand. It is what lets a reader see the whole window at once and
 * pick the month where the field changes, rather than scrubbing to find it.
 * The strip shares the controls row's columns through `subgrid`, so the cards
 * are positioned against exactly the box the ticks are, and a card at either
 * end can hang out under the play button or the toggle without shifting either.
 *
 * The cards are for the pointer only. Each duplicates the tick above it,
 * which is the accessible control for that step and already says its date in
 * full, so the strip is hidden from assistive technology and out of the tab
 * order rather than being a second set of stops that announce the same thing.
 */
export function TimelineBar({
  steps,
  value,
  onChange,
  placeholder = "No dates available",
  loading = false,
  stepDurationMs = 1200,
  preview,
  className,
}: TimelineBarProps) {
  const [playing, setPlaying] = useState(false);
  // Local rather than a map setting: nothing else reads it, and it is a
  // preference about this control's size rather than about what the map shows.
  // Off until asked for, so the bar opens at its compact height and no snapshot
  // is fetched for a reader who never opens the strip.
  const [previewsShown, setPreviewsShown] = useState(false);

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

  // Open only while there is something to put in it — the dates, or their
  // skeletons while the dates are loading. A product with no dates at all
  // collapses the strip rather than holding up a row of empty cards over a
  // rail that says there is nothing to scrub.
  const stripOpen =
    preview !== undefined && previewsShown && (!isEmpty || loading);

  // Cards are mounted when the strip opens, not before: each one starts loading
  // and painting its snapshot the moment it exists, and a strip the reader has
  // hidden should cost nothing. They stay through the collapse, so the cards
  // slide away rather than vanishing from a strip that is still closing, and
  // are released once it has — so a hidden strip does not go on loading every
  // layer the reader switches to. Setting state during render is React's own
  // pattern for a value derived from the previous render; it re-renders before
  // anything paints.
  const [cardsMounted, setCardsMounted] = useState(stripOpen);
  if (stripOpen && !cardsMounted) setCardsMounted(true);

  // Released when the collapse actually finishes, not after a timer of the same
  // length: the two drift apart by a frame or so, and a timer that wins leaves
  // an empty strip for the last of the slide. The timer stays as the fallback
  // for when no transition runs at all — reduced motion — and is set well past
  // the transition so it never races it.
  const releaseCards = () => {
    if (!stripOpen) setCardsMounted(false);
  };
  useEffect(() => {
    if (stripOpen || !cardsMounted) return;
    const timer = setTimeout(
      () => setCardsMounted(false),
      STRIP_TRANSITION_MS * 2,
    );
    return () => clearTimeout(timer);
  }, [stripOpen, cardsMounted]);

  const selectStep = (stepId: string) => {
    setPlaying(false);
    onChange(stepId);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto grid items-center gap-x-5 rounded-panel",
        "border border-line bg-panel-strong px-5 font-cis shadow-float backdrop-blur-md",
        // The strip's row animates between nothing and its own height. The
        // 0fr→1fr swap is what lets a row with no fixed height transition at
        // all; the cell inside is `min-h-0` and clips, so it can be squeezed.
        // Eased at both ends, because this is a slide from rest to rest rather
        // than something arriving: the bar grows upward from its anchored
        // bottom edge, and the rail and cards travel together.
        "transition-[grid-template-rows] ease-in-out motion-reduce:transition-none",
        className,
      )}
      onTransitionEnd={(event) => {
        // Only the bar's own row transition; the cards' border and opacity
        // transitions bubble up here too.
        if (
          event.target === event.currentTarget &&
          event.propertyName === "grid-template-rows"
        ) {
          releaseCards();
        }
      }}
      style={{
        transitionDuration: `${STRIP_TRANSITION_MS}ms`,
        // The toggle's column only exists when there is a toggle, so a bar
        // with nothing to preview keeps the play | rail proportions exactly.
        gridTemplateColumns: preview
          ? "auto minmax(0, 1fr) auto"
          : "auto minmax(0, 1fr)",
        gridTemplateRows: preview
          ? `72px ${stripOpen ? "1fr" : "0fr"}`
          : "72px",
      }}
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
                onClick={() => selectStep(step.id)}
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

      {/* The strip's switch, at the far end of the rail from play. A toggle
          with one name and `aria-pressed` rather than a label that flips
          between "show" and "hide": the state is announced either way, and a
          name that changes under the pointer reads as a different control. */}
      {preview && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreviewsShown((shown) => !shown)}
                // Dimmed for the reason play is: with no dates there is no
                // strip to reveal, but the bar keeps its shape.
                disabled={isEmpty && !loading}
                aria-pressed={previewsShown}
                aria-label="Map previews"
                className={cn(
                  "rounded-full text-fg-subtle hover:text-fg-heading",
                  "focus-visible:ring-brand-medium",
                  previewsShown &&
                    "bg-brand-softer text-fg-brand-strong hover:bg-brand-soft hover:text-fg-brand-strong",
                  "disabled:opacity-40",
                )}
              />
            }
          >
            <GalleryHorizontalEnd className="size-4" />
          </TooltipTrigger>
          <TooltipContent className="font-cis">
            {previewsShown ? "Hide map previews" : "Show map previews"}
          </TooltipContent>
        </Tooltip>
      )}

      {preview && (
        <div
          aria-hidden
          // While collapsing, the cards are still in the DOM — the row shrinks
          // over them rather than unmounting them, which is what lets it
          // animate. `inert` is what stops a half-hidden card from still taking
          // a click.
          inert={!stripOpen}
          // `self-stretch` is load-bearing. The bar centres its items, and a
          // centred cell is its content's height rather than its row's, so it
          // clips nothing: mid-animation the full-height strip hung centred on
          // a half-grown row, over the rail and out past the bar's edge, and
          // snapped into place at the end. Stretched, the cell *is* the row,
          // and the clip is what the slide is made of.
          className="col-span-full row-start-2 grid min-h-0 grid-cols-subgrid self-stretch overflow-hidden"
        >
          {/* Its natural height, from the top of the row, so the cards hang
              from the rail: as the row opens they rise into view from behind
              the bar's bottom edge, and as it closes they sink back behind it
              — one slide, with nothing fading and nothing jumping. */}
          <div
            className="relative col-start-2"
            style={{ height: stripHeight(preview.aspect) }}
          >
            {/* The rail again: the same inset as the ticks' box above, so a
                card's `left` is its tick's. */}
            <div
              className="absolute"
              style={{
                left: RAIL_INSET,
                right: RAIL_INSET,
                top: STRIP_PADDING.top,
                bottom: STRIP_PADDING.bottom,
              }}
            >
              {cardsMounted &&
                (isEmpty && loading
                  ? Array.from({ length: SKELETON_TICKS }, (_, index) => {
                      const last = SKELETON_TICKS - 1;
                      return (
                        <div
                          key={index}
                          className="absolute top-0 -translate-x-1/2 rounded-panel border border-line bg-panel-solid"
                          style={{
                            left: `${(index / last) * 100}%`,
                            width: cardWidth(last),
                            padding: CARD_INSET - 1,
                          }}
                        >
                          <Skeleton
                            className="w-full rounded-[5px] bg-line-strong"
                            style={{ aspectRatio: preview.aspect }}
                          />
                        </div>
                      );
                    })
                  : steps.map((step, index) => {
                      const isActive = index === activeIndex;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          tabIndex={-1}
                          onClick={() => selectStep(step.id)}
                          style={{
                            left: `${positionOf(index)}%`,
                            width: cardWidth(lastIndex),
                            padding: CARD_INSET - 1,
                          }}
                          className={cn(
                            "absolute top-0 -translate-x-1/2 cursor-pointer rounded-panel border",
                            "transition-[border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none",
                            // The selected step is outlined in brand and shown
                            // at full strength; the rest step back a little, so
                            // the one the map is showing is found at a glance
                            // even mid-playback.
                            isActive
                              ? "border-brand bg-brand-softer shadow-[0_0_0_1px_var(--color-brand)]"
                              : "border-line bg-panel-solid opacity-70 hover:border-line-strong hover:opacity-100",
                          )}
                        >
                          <div
                            className="w-full overflow-hidden rounded-[5px] bg-well"
                            style={{ aspectRatio: preview.aspect }}
                          >
                            {preview.render(step)}
                          </div>
                        </button>
                      );
                    }))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
