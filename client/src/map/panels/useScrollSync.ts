import { useState } from "react";

/**
 * One horizontal position held by several viewports — tables stacked as one
 * grid (see ForecastTables), or a table on its own — and the motion that
 * carries it on once the reader lets go.
 *
 * The position runs past either end, by however far the grid is stretched
 * there. A viewport's `scrollLeft` cannot, so it stops at the end and the rest
 * is drawn: the months slide on past it while the label column stays put (see
 * drawStretch). The stretch is the group's, like the scroll: every card in a
 * stack bounces together, and the columns never part.
 *
 * Mouse drags reach it through useDragScroll; wheels and trackpads through the
 * listener each viewport gets here. A finger or a pen pans natively, with the
 * platform's own bounce.
 */
export type ScrollSync = {
  /**
   * Adds a viewport to the group, at the position the others are at.
   * `adopted` is true when there was one: that position is the reader's, and
   * the table should not then move it to show the current month.
   */
  register: (viewport: HTMLElement) => {
    adopted: boolean;
    release: () => void;
  };
  /**
   * Stops whatever the group is doing, where it is on screen, and returns the
   * position in drag terms: a stretch counts as the pull that made it, so a
   * drag picked up mid-bounce carries on from there without a jump.
   */
  grab: (viewport: HTMLElement) => number;
  /** Moves the group to where a drag has taken it, stretching past an end. */
  drag: (to: number, time: number) => void;
  /**
   * Lets go: on at the speed the drag was moving, slowing to a stop, and back
   * from past an end.
   */
  fling: (time: number) => void;
};

/**
 * How much speed a glide keeps each millisecond: UIScrollView's normal rate,
 * so a flick carries about as far as it would on a phone.
 */
const DECELERATION = 0.998;

/** Below this a glide has stopped, in px per ms: a third of a pixel a frame. */
const REST_SPEED = 0.02;

/**
 * The spring that pulls a stretch back: critically damped, so it comes back
 * to the end without wobbling past it, over a response of 350ms.
 */
const OMEGA = (2 * Math.PI) / 350;
const STIFFNESS = OMEGA ** 2;
const DAMPING = 2 * OMEGA;

/** How hard the grid resists a pull past an end: UIScrollView's constant. */
const RESISTANCE = 0.55;

/**
 * The furthest a glide bounces past an end, as a share of the viewport: a
 * hard flick gets most of it, a gentle one a little.
 */
const MAX_BOUNCE = 1 / 6;

/** How far back a release looks for the drag's speed, in ms. */
const VELOCITY_WINDOW = 80;

/**
 * How long a wheel that has run past an end stays the group's, in ms: the rest
 * of the swipe is scrolled here too, so a swipe back is not lost to a browser
 * that ignores the rest of a gesture once its start was cancelled.
 */
const WHEEL_HOLD = 300;

/** A wheel's line, for one that counts in lines, in px. */
const LINE_HEIGHT = 16;

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * What slides when the grid stretches, and what stays: the table's rows, and
 * its label column held back against them. The sections rather than the table
 * itself, so the table's own box still spans the scroll width: content moved
 * left would otherwise shrink the range and drag the scroll back with it.
 */
const SLIDING = "table > thead, table > tbody";
const PINNED = "[data-sticky-label]";

/** A ScrollSync for a group of tables, kept for the owner's lifetime. */
export function useScrollSync(): ScrollSync {
  const [sync] = useState(createScrollSync);
  return sync;
}

/**
 * How far a pull of `past` beyond an end stretches the grid: nearly as far at
 * first, less and less after, and never as far as `width`. Real things slow
 * before they stop.
 */
function band(past: number, width: number) {
  return (past * width * RESISTANCE) / (width + RESISTANCE * Math.abs(past));
}

/** The pull that stretches the grid `by`: band, the other way round. */
function unband(by: number, width: number) {
  return (by * width) / (RESISTANCE * (width - Math.abs(by)));
}

const clamp = (value: number, max: number) =>
  Math.min(Math.max(value, 0), max);

function drawStretch(viewport: HTMLElement, by: number) {
  const slide = by ? `${-by}px` : "";
  const hold = by ? `${by}px` : "";
  for (const el of viewport.querySelectorAll<HTMLElement>(SLIDING)) {
    el.style.translate = slide;
  }
  for (const el of viewport.querySelectorAll<HTMLElement>(PINNED)) {
    el.style.translate = hold;
  }
}

function createScrollSync(): ScrollSync {
  const viewports = new Set<HTMLElement>();
  /** The scroll position the viewports share, once one has moved. */
  let left: number | null = null;
  /**
   * The position the group last set itself, so the scroll events that raises
   * are known for its own. Null while nothing is moving it.
   */
  let written: number | null = null;
  /** How far past an end the grid is drawn: negative past the start. */
  let stretch = 0;
  let drawn = 0;
  /** In px per ms, positive towards the end. */
  let velocity = 0;
  /**
   * The scroll range and the viewport's width, measured while the grid is not
   * stretched: a stretch moves content the range is measured from.
   */
  let max = 0;
  let width = 0;
  let elastic = true;
  const reduced = window.matchMedia(REDUCED);
  let frame = 0;
  let samples: { time: number; at: number }[] = [];
  let wheelHeld = -Infinity;

  const measure = (viewport: HTMLElement) => {
    elastic = !reduced.matches;
    if (stretch !== 0) return;
    max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    width = viewport.clientWidth;
  };

  // Every scroll first, then every stretch: a scroll write wants the layout
  // the stretch's style writes would dirty.
  const paint = (scroll: number) => {
    if (scroll !== left) {
      for (const viewport of viewports) viewport.scrollLeft = scroll;
    }
    left = written = scroll;
    if (stretch === drawn) return;
    drawn = stretch;
    for (const viewport of viewports) drawStretch(viewport, stretch);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    written = null;
    velocity = 0;
  };

  /** One slice of the motion, `h` ms long; returns the new scroll. */
  const step = (scroll: number, h: number) => {
    if (stretch === 0) {
      velocity *= DECELERATION ** h;
      const to = scroll + velocity * h;
      const end = clamp(to, max);
      if (to !== end) {
        if (!elastic) {
          velocity = 0;
        } else {
          // Into an end at speed: on past it, eased so that a hard flick
          // does not throw the grid halfway across the panel. A critically
          // damped spring set off at `v` peaks at v / (ω·e).
          const cap = width * MAX_BOUNCE * OMEGA * Math.E;
          velocity = cap * Math.tanh(velocity / cap);
          stretch = to - end;
        }
      }
      return end;
    }
    velocity -= (STIFFNESS * stretch + DAMPING * velocity) * h;
    const to = stretch + velocity * h;
    if (Math.sign(to) === Math.sign(stretch)) {
      stretch = to;
      return scroll;
    }
    // Back over the end and into the months, gliding on.
    stretch = 0;
    return clamp(scroll + to, max);
  };

  const run = () => {
    if (frame) return;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 64);
      last = now;
      let scroll = left ?? 0;
      // Scrolled from elsewhere meanwhile — the bar, the keyboard, the table
      // bringing the current month into view. That ends a glide, though a
      // stretch still springs back.
      if (left !== written && stretch === 0) return stop();
      const first = viewports.values().next().value;
      if (!first) return stop();
      measure(first);

      const steps = Math.ceil(elapsed);
      for (let i = 0; i < steps; i++) scroll = step(scroll, elapsed / steps);

      const settled =
        Math.abs(velocity) < REST_SPEED &&
        (stretch === 0 || Math.abs(stretch) < 0.5);
      if (settled) stretch = 0;
      paint(scroll);
      if (settled) return stop();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  /**
   * A sideways wheel or trackpad swipe. Within the range it is the browser's
   * own scroll; past an end it stretches the grid as a drag would, and the
   * spring takes it back once the deltas stop coming.
   */
  const onWheel = (viewport: HTMLElement, event: WheelEvent) => {
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? LINE_HEIGHT
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewport.clientWidth
          : 1;
    const dx = event.deltaX * unit;
    // Sideways only: a turn of the wheel down is the panel's to scroll.
    if (Math.abs(dx) <= Math.abs(event.deltaY * unit)) return;
    if (stretch === 0 && frame) stop();
    measure(viewport);
    // A table that fits has nowhere to go, and nothing to bounce.
    if (!elastic || max === 0) return;

    const scroll = stretch === 0 ? viewport.scrollLeft : (left ?? 0);
    const to = scroll + unband(stretch, width) + dx;
    const end = clamp(to, max);
    const held =
      stretch !== 0 || event.timeStamp - wheelHeld < WHEEL_HOLD;
    if (to === end && !held) return;

    if (event.cancelable) {
      event.preventDefault();
      wheelHeld = event.timeStamp;
    } else if (to === end || Math.sign(dx) !== Math.sign(to - end)) {
      // Too late in the swipe to cancel: the browser scrolls this delta
      // itself, and the stretch springs back under it.
      return;
    }
    const was = stretch;
    stretch = band(to - end, width);
    // The spring's own speed carries through a push, so a swipe held against
    // the end settles at a stretch rather than growing without limit.
    if (stretch === 0 || Math.sign(stretch) !== Math.sign(was)) velocity = 0;
    paint(end);
    if (stretch !== 0) run();
    else written = null;
  };

  return {
    register(viewport) {
      const adopted = left !== null;
      if (left !== null) viewport.scrollLeft = left;
      if (stretch !== 0) drawStretch(viewport, stretch);

      const onScroll = () => {
        // Reading the viewport's position now rather than trusting the
        // event: a follower's scroll event arrives after the leader has
        // moved on, and echoing its stale position back would make a
        // trackpad fling stutter. And within a pixel of the group's own
        // write is that write, as the browser rounded it.
        const at = viewport.scrollLeft;
        if (at === left) return;
        if (written !== null && Math.abs(at - written) < 1) return;
        left = at;
        for (const other of viewports) {
          if (other !== viewport) other.scrollLeft = left;
        }
      };
      const wheel = (event: WheelEvent) => onWheel(viewport, event);

      viewports.add(viewport);
      viewport.addEventListener("scroll", onScroll, { passive: true });
      // Not passive: past an end the stretch replaces the browser's scroll.
      viewport.addEventListener("wheel", wheel, { passive: false });
      return {
        adopted,
        release: () => {
          viewports.delete(viewport);
          viewport.removeEventListener("scroll", onScroll);
          viewport.removeEventListener("wheel", wheel);
          drawStretch(viewport, 0);
          if (viewports.size === 0) {
            stop();
            stretch = drawn = 0;
          }
        },
      };
    },

    grab(viewport) {
      stop();
      measure(viewport);
      samples = [];
      const scroll = stretch === 0 ? viewport.scrollLeft : (left ?? 0);
      left = scroll;
      return scroll + unband(stretch, width);
    },

    drag(to, time) {
      const end = clamp(to, max);
      stretch = elastic ? band(to - end, width) : 0;
      paint(end);
      samples = samples.filter((s) => time - s.time <= VELOCITY_WINDOW);
      samples.push({ time, at: end + stretch });
    },

    fling(time) {
      // The speed over the drag's last moments — none if the pointer stood
      // still before letting go, which is a placement, not a throw.
      const recent = samples.filter((s) => time - s.time <= VELOCITY_WINDOW);
      const first = recent[0];
      const last = recent.at(-1);
      velocity =
        first && last && last.time > first.time && time - last.time < 40
          ? (last.at - first.at) / (last.time - first.time)
          : 0;
      samples = [];
      run();
    },
  };
}
