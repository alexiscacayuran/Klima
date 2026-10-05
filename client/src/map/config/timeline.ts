import type { CisProductName, ProductCatalogue } from "@/api/products";

/**
 * The window of dates a product's timeline scrubs through, derived from the
 * catalogue rather than written down.
 *
 * The months and days on the scrubber are a property of the *issuance*, not of
 * this app: CIS publishes a lead time per bulletin and the window moves every
 * time a forecast is issued. `/products.latestData` is the one field that says
 * where the newest issuance starts, so a window is that anchor plus this file's
 * description of how far and which way the product's own window runs from it.
 *
 * The direction is per product and is deliberately not assumed — daily
 * monitoring reaches back from its anchor, the forecasts reach forward, and a
 * product added later may do neither. See PRODUCT_TIMELINES.
 *
 * The direction decides *which dates* are in the window and nothing about their
 * order. Every window is listed earliest first, so the scrubber reads left to
 * right as time does and plays forward in time whatever the product.
 */

/** The granularity a product's `date` parameter speaks (docs/cis-api.md §6). */
export type TimelineUnit = "month" | "day";

export type TimelineSpec = {
  unit: TimelineUnit;
  /** How many steps the window holds, counting the anchor itself. */
  count: number;
  /**
   * Which side of `latestData` the window lies on — which dates it holds, not
   * the order they are listed in, which is always earliest first.
   *
   * `forward` is a forecast: the anchor is the earliest date and the window
   * looks ahead, so it is the first step. `backward` is an observation record:
   * the anchor is the most recent date and the window looks back, so it is the
   * last step.
   *
   * Either way the anchor end is where the window opens (see `timelineFor`),
   * because that is the reading the product leads with — the first forecast
   * month, the latest observation — and the one CIS answers with when a request
   * omits `date`.
   */
  direction: "forward" | "backward";
  /**
   * How many units after the anchor the window's anchor end falls — zero, the
   * anchor itself, when absent.
   *
   * For a window that is one part of an issuance and does not start where the
   * issuance does. `latestData` is the earliest date of an issuance, and the
   * drought outlook is the six months that *follow* it: the anchor is the
   * assessment month, which the outlook endpoint does not publish.
   */
  offset?: number;
};

/**
 * One step on the scrubber.
 *
 * `id` is the value the caller stores and the API is queried with, so it is the
 * granularity the product's own `date` parameter takes — `YYYY-MM` for the
 * monthly products, `YYYY-MM-DD` for the daily ones.
 */
export type TimelineStep = {
  id: string;
  /**
   * What the tick prints. Only the parts that *changed* since the previous
   * step, so a six-month window reads "Sep 2026 · Oct · Nov · Dec · Jan 2027 ·
   * Feb": the year is stated where it is in question and nowhere else, which is
   * the one place a bare "Jan" would be ambiguous.
   */
  label: string;
  /**
   * The same date, always complete — "September 2026". The accessible name for
   * the tick, because the abbreviation above is only unambiguous next to its
   * neighbours and a screen reader arrives at one tick alone.
   */
  fullLabel: string;
};

/**
 * How each CIS product's window is shaped around its anchor.
 *
 * Keyed by the API's own product names, not the rail's: the rail lists PAGASA's
 * published bulletins and the API lists the four datasets CIS has loaded, and
 * the two vocabularies only partly overlap (see map/config/products.ts).
 */
export const PRODUCT_TIMELINES: Record<CisProductName, TimelineSpec> = {
  /**
   * Six months ahead, the anchor being the first of them. `latestData` is
   * `2026-09-01`; the issuance covers 2026-09 → 2027-02.
   */
  seasonal: { unit: "month", count: 6, direction: "forward" },

  /**
   * Seven months, not six: one issuance publishes its **assessment** month —
   * which is what `latestData` points at — followed by six months of
   * **outlook**.
   *
   * The whole issuance, and a fallback only: the rail maps the two halves as
   * separate layers, off separate endpoints, and each declares its own window
   * (see DROUGHT_TIMELINES). A drought layer that declared none would scrub
   * this.
   */
  drought: { unit: "month", count: 7, direction: "forward" },

  /**
   * Five days from the issuance date.
   *
   * With a caveat the anchor cannot express: 18 of 63 recorded issuances also
   * carry a *leading* day — the day before, published for a subset of provinces
   * only — and `latestData` is the span's earliest date, so on those issuances
   * it reports that partial day and the block is really six long. Deriving the
   * end from the anchor is therefore wrong about a third of the time
   * (docs/cis-api.md §5).
   *
   * Five forward is the right default for a picker that has only the catalogue
   * to go on, and it is wrong in the safe direction: it never invents a day
   * PAGASA did not publish, it only omits the thin leading one. When `/fiveday`
   * is wired, replace this window with the issuance's own `data[].date` list —
   * that response states the span instead of implying it.
   */
  fiveday: { unit: "day", count: 5, direction: "forward" },

  /**
   * A week of observations ending at the newest one.
   *
   * The only product whose window reaches backwards, because it is the only one
   * that is not a forecast: an issuance carries exactly one observed day, so
   * there is nothing ahead of the anchor to scrub to. Seven matches the default
   * `period` on `/daily-monitoring/historical`, which is where the other six
   * days come from and which fills every day in the window — nulls included —
   * so the scrubber never has to gap-fill.
   *
   * The anchor is not yesterday. Daily monitoring lags, by roughly three weeks
   * at the time the docs were written, and that lag is exactly what `latestData`
   * reports so the app never has to probe for it.
   */
  "daily-monitoring": { unit: "day", count: 7, direction: "backward" },
};

/**
 * The drought issuance split the way the rail splits it: one window per layer,
 * each the months its own endpoint answers for.
 *
 * Declared on the layers themselves (config/products `ProductLayer.timeline`),
 * because the two halves are different kinds of statement and scrub
 * differently — which PRODUCT_TIMELINES, one window per dataset, cannot say.
 */
export const DROUGHT_TIMELINES = {
  /**
   * The six most recent assessments — `historical=true` on
   * `/drought/assessment`. An observation record, so it reaches backwards like
   * daily monitoring does: the anchor is the current assessment, which is the
   * last step and the one the layer opens on.
   *
   * Derived from the anchor rather than from the months the response carries,
   * so a month CIS holds no assessment for still has its step, and says so.
   */
  assessment: { unit: "month", count: 6, direction: "backward" },
  /** The six outlook months after the assessment. */
  outlook: { unit: "month", count: 6, direction: "forward", offset: 1 },
} as const satisfies Record<string, TimelineSpec>;

/**
 * Formatters, all pinned to `en-PH` and to UTC.
 *
 * The locale is fixed rather than the browser's because every other string in
 * this UI is English, and a half-translated scrubber reads as a bug rather than
 * as localisation.
 *
 * `timeZone: 'UTC'` is load-bearing, not tidiness. Every date here is built
 * through `Date.UTC` from a calendar date that has no time and no zone;
 * formatting one in the browser's own zone slides it back a day for every
 * reader west of Greenwich, which would be wrong for half the world and right
 * in Manila, where it would never be caught. Same trap as the `issuedAt` note
 * in docs/cis-api.md §6.
 */
const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "UTC" });

const MONTH = format({ month: "short" });
const MONTH_YEAR = format({ month: "short", year: "numeric" });
const MONTH_YEAR_LONG = format({ month: "long", year: "numeric" });
const DAY = format({ day: "numeric" });
const DAY_MONTH = format({ month: "short", day: "numeric" });
const DAY_MONTH_YEAR = format({
  month: "short",
  day: "numeric",
  year: "numeric",
});
const DAY_MONTH_YEAR_LONG = format({
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** A calendar date with no time and no zone — what the API's date strings are. */
type CalendarDate = { year: number; month: number; day: number };

/**
 * `YYYY-MM-DD` or `YYYY-MM` → its parts, or null if it is neither.
 *
 * Hand-parsed rather than handed to `new Date`, which accepts both but resolves
 * them differently: `"2026-09"` and `"2026-09-07"` are parsed as UTC, while
 * `"2026-9-7"` is parsed as *local* time. Reading the parts out is the only way
 * the caller gets one rule.
 */
function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: day ? Number(day) : 1,
  };
  if (parsed.month < 1 || parsed.month > 12) return null;
  if (parsed.day < 1 || parsed.day > 31) return null;
  return parsed;
}

/**
 * The date `delta` units from the anchor.
 *
 * `Date.UTC` normalises out-of-range parts itself — month 12 rolls into
 * January of the next year, day 32 into the next month — which is what makes a
 * six-month window that crosses a year boundary, or a week that crosses a month
 * boundary, need no arithmetic of its own.
 */
function advance(
  anchor: CalendarDate,
  unit: TimelineUnit,
  delta: number,
): Date {
  return unit === "month"
    ? new Date(Date.UTC(anchor.year, anchor.month - 1 + delta, 1))
    : new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + delta));
}

/** The id the product's own `date` parameter takes for this date. */
const stepId = (date: Date, unit: TimelineUnit) =>
  date.toISOString().slice(0, unit === "month" ? 7 : 10);

/**
 * The tick's label: this step's own unit, plus every coarser part that has
 * changed since the previous step.
 *
 * The first step has no previous, so it prints in full — which is what puts the
 * year on the left end of the scrubber, where a reader looks for it.
 */
function stepLabel(date: Date, unit: TimelineUnit, previous?: Date): string {
  const newYear =
    !previous || date.getUTCFullYear() !== previous.getUTCFullYear();
  const newMonth = newYear || date.getUTCMonth() !== previous.getUTCMonth();

  if (unit === "month") {
    return (newYear ? MONTH_YEAR : MONTH).format(date);
  }
  if (newYear) return DAY_MONTH_YEAR.format(date);
  if (newMonth) return DAY_MONTH.format(date);
  return DAY.format(date);
}

/**
 * The steps a product's scrubber holds, given the catalogue's anchor for it —
 * earliest first, whichever side of the anchor the window lies on.
 *
 * Empty when the product has no data loaded (`latestData: null`) or when the
 * anchor is not a date this build understands — an empty window is a state the
 * scrubber renders honestly, and is why nothing here falls back to today's
 * date. A window anchored on today would look identical to a real one while
 * pointing at months CIS has published nothing for.
 */
export function timelineSteps(
  spec: TimelineSpec,
  latestData: string | null | undefined,
): TimelineStep[] {
  if (!latestData) return [];
  const anchor = parseCalendarDate(latestData);
  if (!anchor) return [];

  // The earliest step, in units from the anchor: the anchor end itself for a
  // window that looks ahead, and `count - 1` units before it for one that looks
  // back. Counting up from there lists either kind in time order.
  const anchorEnd = spec.offset ?? 0;
  const earliest =
    spec.direction === "forward" ? anchorEnd : anchorEnd - (spec.count - 1);
  const dates = Array.from({ length: spec.count }, (_, index) =>
    advance(anchor, spec.unit, earliest + index),
  );

  return dates.map((date, index) => ({
    id: stepId(date, spec.unit),
    label: stepLabel(date, spec.unit, dates[index - 1]),
    fullLabel: formatStepId(stepId(date, spec.unit)),
  }));
}

/**
 * A step id spelled out for a reader: "2026-10" → "October 2026",
 * "2026-09-07" → "September 7, 2026".
 *
 * Granularity is read off the id rather than passed in, so a component holding
 * only the selected value — the selection popup — can print it without also
 * knowing which product produced it.
 *
 * Returns the id untouched if it is not a date, so an unrecognised value shows
 * as itself rather than as "Invalid Date".
 */
export function formatStepId(id: string): string {
  const parsed = parseCalendarDate(id);
  if (!parsed) return id;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return id.length > 7
    ? DAY_MONTH_YEAR_LONG.format(date)
    : MONTH_YEAR_LONG.format(date);
}

/**
 * A monthly step id as a column head: "2026-10" → "Oct".
 *
 * Month only, and only for month ids — the detail table sets six months side
 * by side and names the year once, in its own header, the way the scrubber
 * puts it on the first tick only. Anything else comes back untouched.
 */
export function formatStepMonth(id: string): string {
  const parsed = id.length === 7 ? parseCalendarDate(id) : null;
  if (!parsed) return id;
  return MONTH.format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
}

const ISSUED = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  // The issuance's own zone. `issuedAt` carries +08:00, so this is the date
  // PAGASA issued on, whatever zone the reader is in.
  timeZone: "Asia/Manila",
});

/** An issuance's `issuedAt` as a date: "2026-08-26T…+08:00" → "Aug 26, 2026". */
export function formatIssuedAt(issuedAt: string): string {
  return ISSUED.format(new Date(issuedAt));
}

/** A window, and where it opens. */
export type Timeline = {
  /** Earliest first. */
  steps: TimelineStep[];
  /**
   * The step a selection lands on when it holds no date in this window: the
   * anchor end — the first step of a window that looks ahead, the last of one
   * that looks back (see TimelineSpec `direction`). Null for an empty window.
   *
   * Carried beside the steps rather than left to whoever reads them, because
   * "the first step" stopped being the answer once every window was listed in
   * time order, and the scrubber should not have to know which kind it holds.
   */
  initialStepId: string | null;
};

const EMPTY_TIMELINE: Timeline = { steps: [], initialStepId: null };

/**
 * The window for a selected layer, or an empty one when the map's current
 * selection has no CIS dataset behind it.
 *
 * The anchor is always the product's — `latestData` is published per dataset —
 * but the shape can be the layer's own (config/products
 * `timelineSpecForVariable`); absent, it is the dataset's.
 *
 * Two separate reasons for an empty window, deliberately collapsed into one
 * result: the rail lists PAGASA bulletins CIS has not loaded yet (S2S, farm
 * weather), and a loaded product can still have `latestData: null`. Both mean
 * "there are no dates to scrub", and the scrubber says so the same way.
 */
export function timelineFor(
  product: CisProductName | undefined,
  spec: TimelineSpec | undefined,
  catalogue: ProductCatalogue | undefined,
): Timeline {
  if (!product || !catalogue) return EMPTY_TIMELINE;
  const shape = spec ?? PRODUCT_TIMELINES[product];
  const steps = timelineSteps(shape, catalogue[product]?.latestData);
  const initial = shape.direction === "forward" ? steps[0] : steps.at(-1);
  return { steps, initialStepId: initial?.id ?? null };
}
