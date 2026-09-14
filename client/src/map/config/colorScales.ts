import chroma from "chroma-js";

/**
 * The published symbology for one mapped layer — the colours the choropleth
 * paints, the classes a value falls into, and the words for each class.
 *
 * One table per *layer*, not per variable: seasonal rainfall is published as
 * two layers off one variable — a forecast total in mm and a percent of normal
 * — and they are different quantities on different domains with different
 * colours. Keying at the variable would force them to share a ramp, which is
 * how a 120 mm forecast and a 120% departure end up the same blue.
 *
 * Each layer's table is wired to its reading in config/seasonalReadings.ts,
 * which is the file that already keys on `variable:layer`. Everything here is
 * colour and classification; nothing here knows which API field it is about.
 *
 * Three consumers, from one table:
 *
 * - The selection popup, which quotes a value and needs the swatch and the
 *   class name that go with it.
 * - The legend component, which needs the classes as rows, or the ramp as a
 *   gradient — both are derived below rather than re-authored there.
 * - The choropleth, when it lands: `colorAt` is the fill for a stretched
 *   render and `classes` is the stop list for a classed one.
 */

/**
 * One row of a symbology table: a break, the colour published at it, and what
 * a value in the class starting there means.
 *
 * A break is the class's *inclusive lower bound* as well as the ramp's stop
 * position, which is what lets one table describe both the gradient and the
 * discrete classes. The last row's class is open-topped.
 */
export type ScaleBreak = {
  value: number;
  /** The hex as published. Copied, never re-derived. */
  color: string;
  /** What a value in this class means, in words. */
  label: string;
};

/** One class, as the legend lists it and the popup names it. */
export type ScaleClass = {
  /** Inclusive. */
  from: number;
  /** Exclusive; null for the open-topped last class. */
  to: number | null;
  color: string;
  label: string;
  /**
   * The bounds as printed — "100–200", "≥ 500". Unit-free on purpose: a legend
   * states its unit once in its own heading rather than on every row.
   */
  range: string;
};

export type ColorScale = {
  /** The authored table, in ascending order. */
  breaks: readonly ScaleBreak[];
  /** The same table read as classes — what a discrete legend lists. */
  classes: readonly ScaleClass[];
  /** The interpolated colour at a value; clamped outside the domain. */
  colorAt: (value: number) => string;
  /** The class a value falls in; clamped to the first class below the domain. */
  classAt: (value: number) => ScaleClass;
  /** The ramp as a CSS gradient, for a continuous legend bar. */
  gradient: (direction?: string) => string;
};

/**
 * A table turned into the three things that read it.
 *
 * chroma interpolates in **rgb**, its default, and deliberately not in lab or
 * oklab. These tables come out of a GIS renderer, which stretches between stops
 * in rgb; a perceptual space would produce a smoother ramp than the one PAGASA
 * publishes, which is the wrong kind of improvement for a map that has to match
 * the bulletin beside it. The authored hexes come back exactly at their breaks
 * under every mode — only the colours *between* them differ.
 *
 * The classes take each break's own colour rather than `chroma.scale().classes()`,
 * which recolours a class at its midpoint in the ramp: with an uneven domain —
 * 50 mm steps at the bottom, 100 mm at the top — that would print swatches that
 * appear nowhere in the published table.
 */
function buildScale(breaks: readonly ScaleBreak[]): ColorScale {
  const domain = breaks.map((step) => step.value);
  const ramp = chroma.scale(breaks.map((step) => step.color)).domain(domain);

  const classes: ScaleClass[] = breaks.map((step, index) => {
    const next = breaks[index + 1];
    return {
      from: step.value,
      to: next ? next.value : null,
      color: step.color,
      label: step.label,
      range: next ? `${step.value}–${next.value}` : `≥ ${step.value}`,
    };
  });

  const min = domain[0];
  const span = domain[domain.length - 1] - min;

  return {
    breaks,
    classes,
    colorAt: (value) => ramp(value).hex(),
    // Downwards, so the first class that starts at or below the value wins and
    // the open-topped last class needs no upper bound to test against.
    classAt: (value) => {
      for (let index = classes.length - 1; index > 0; index -= 1) {
        if (value >= classes[index].from) return classes[index];
      }
      return classes[0];
    },
    // Positioned by the domain, not by index: the breaks are unevenly spaced,
    // and spreading them evenly would draw a gradient that disagrees with the
    // fill on the map at every value between two stops.
    gradient: (direction = "to right") =>
      `linear-gradient(${direction}, ${breaks
        .map(
          (step) =>
            `${step.color} ${(((step.value - min) / span) * 100).toFixed(2)}%`,
        )
        .join(", ")})`,
  };
}

/**
 * Seasonal rainfall forecast, in mm — the monthly total the issuance predicts.
 *
 * Hexes are PAGASA's, copied from the seasonal module's symbology sheet. The
 * domain is uneven by design: 50 mm steps up to 100, then 100 mm steps, so the
 * ramp spends its most legible range on the totals that separate a dry month
 * from a wet one.
 *
 * The words describe the *amount*, never a departure from normal — a 30 mm
 * February in Ilocos is a dry month and an unremarkable one, and saying which
 * is the percent-of-normal layer's job, not this one's. That is also why they
 * avoid the light/moderate/heavy vocabulary PAGASA reserves for rainfall
 * warnings: those are rates over hours, and these are totals over a month.
 * They name the published bands in plain language; they are not a PAGASA
 * classification, unlike the percent-of-normal categories below.
 */
export const RAINFALL_FORECAST_SCALE = buildScale([
  { value: 0, color: "#e1e1e1", label: "Very dry month" },
  { value: 50, color: "#bee8ff", label: "Dry month" },
  { value: 100, color: "#01c5ff", label: "Moderate month" },
  { value: 200, color: "#0071fe", label: "Wet month" },
  { value: 300, color: "#004da7", label: "Very wet month" },
  { value: 400, color: "#002573", label: "Extremely wet month" },
  { value: 500, color: "#000000", label: "Exceptional rainfall" },
]);

/**
 * Percent of normal rainfall, where 100 is normal.
 *
 * The breaks and the five names are PAGASA's own published categories — way
 * below / below / near / above / way above normal, at 40, 80, 120 and 160 — so
 * the popup and the legend say what the bulletin says. PAGASA prints them as
 * integer bands ("≤40", "41–80"); the field is a float, so the boundary is
 * treated as the continuous break and a value of exactly 40.0 reads as "Below
 * normal".
 *
 * The colours are **provisional**: the seasonal symbology sheet covers the
 * forecast layer, and this one has no published table yet. They are diverging
 * around the neutral at 80–120 and share the forecast ramp's wet end, so the
 * two layers read as one map. Replace the five hexes when CIS publishes the
 * real ones — nothing else here changes.
 */
export const RAINFALL_PERCENT_OF_NORMAL_SCALE = buildScale([
  { value: 0, color: "#fe0000", label: "Way below normal" },
  { value: 40, color: "#ffff00", label: "Below normal" },
  { value: 80, color: "#38a700", label: "Near normal" },
  { value: 120, color: "#005be7", label: "Above normal" },
]);
