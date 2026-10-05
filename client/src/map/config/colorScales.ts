import chroma from "chroma-js";
import type { DroughtStatus } from "@/api/drought";

/**
 * The published symbology for one mapped layer — the colours the choropleth
 * paints, the classes a value falls into, and — where the layer has them — the
 * words for each class.
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
  /**
   * What a value in this class means, in words. Optional: a layer whose bands
   * have no published names carries none, and every consumer prints the number
   * and colour alone rather than inventing one.
   */
  label?: string;
  /**
   * The label's abbreviation as PAGASA prints it — "AN", "NN", "BN" — for a
   * figure too small to carry the words. Optional, like the label it shortens.
   */
  tag?: string;
  /**
   * The class's bounds as the published legend prints them, where they are not
   * the plain break-to-break span — a table printed to two decimals whose
   * breaks sit between them (see TEMPERATURE_ANOMALY_SCALE). Absent, the range
   * is derived from the breaks.
   */
  range?: string;
};

/** One class, as the legend lists it and the popup names it. */
export type ScaleClass = {
  /** Inclusive. */
  from: number;
  /** Exclusive; null for the open-topped last class. */
  to: number | null;
  color: string;
  label?: string;
  tag?: string;
  /**
   * The bounds as printed — "100–200", "≥ 500". Unit-free on purpose: a legend
   * states its unit once in its own heading rather than on every row.
   */
  range: string;
};

/**
 * The two readings of one table.
 *
 * - `ramp` interpolates between the breaks: a value halfway between two of them
 *   gets a colour halfway between theirs.
 * - `step` paints each class flat in its own published colour. It is the reading
 *   PAGASA ships — their seasonal maps are classed, and a value is *in* a band
 *   rather than somewhere along a gradient.
 *
 * **Declared, not chosen.** A published field is meant to be read one way, and
 * which way is a property of the product — so each raster states it on its own
 * RasterVariant (config/rasters) and nothing on screen offers to overrule it.
 * The type is defined here rather than there because the raster is not the only
 * thing that colours a value: the popup's swatch and a station's pill resolve
 * the same declaration and paint through `colorFor` below, so one number cannot
 * be one colour in the card and another in the field under it.
 */
export type SymbologyMode = "ramp" | "step";

/**
 * How a value is read when nothing declares it — a layer with no published
 * surface, which today is seasonal temperature: CIS publishes it per station
 * only, so there is no raster to carry the declaration and only pills to colour.
 *
 * Classed, because that is what the bulletin beside the map shows, and because a
 * pill sits next to a class name in the popup. The ramp is the interpretive
 * reading — smoother, and it implies a precision between breaks that a monthly
 * seasonal aggregate does not have.
 */
export const DEFAULT_SYMBOLOGY_MODE: SymbologyMode = "step";

export type ColorScale = {
  /**
   * What the breaks are measured in — "mm", "%", "°C" — as the legend heads it.
   *
   * On the table rather than on whatever maps it, because the numbers in
   * `breaks` mean nothing without it and this is the one object that carries
   * them: the forecast and its percent of normal are separate tables precisely
   * because they are different quantities, and the unit is the difference.
   */
  unit: string;
  /** The authored table, in ascending order. */
  breaks: readonly ScaleBreak[];
  /** The same table read as classes — what a discrete legend lists. */
  classes: readonly ScaleClass[];
  /** The interpolated colour at a value; clamped outside the domain. */
  colorAt: (value: number) => string;
  /** The class a value falls in; clamped to the first class below the domain. */
  classAt: (value: number) => ScaleClass;
  /**
   * The colour a value is *painted*, under the mode its layer declares.
   *
   * The one answer to "what colour is this number", and the reason it exists
   * rather than each caller picking between the two above: a swatch that quotes
   * a class while the surface under it interpolates is a card disagreeing with
   * its own map. Anything that shows a colour for a value goes through here;
   * `colorAt` and `classAt` remain for the legend, which draws both readings at
   * once and is asking a different question.
   */
  colorFor: (value: number, mode: SymbologyMode) => string;
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
 *
 * `decimals`, for a table whose bounds are printed to a fixed precision, makes
 * `classAt` read the value as printed — rounded the way `toFixed` rounds, which
 * is how every consumer prints it — so a figure and the class it is painted in
 * cannot disagree at a boundary. Absent, the value is read as it comes.
 */
function buildScale(
  unit: string,
  breaks: readonly ScaleBreak[],
  { decimals }: { decimals?: number } = {},
): ColorScale {
  const domain = breaks.map((step) => step.value);
  const ramp = chroma.scale(breaks.map((step) => step.color)).domain(domain);

  const classes: ScaleClass[] = breaks.map((step, index) => {
    const next = breaks[index + 1];
    return {
      from: step.value,
      to: next ? next.value : null,
      color: step.color,
      label: step.label,
      tag: step.tag,
      range:
        step.range ??
        (next ? `${step.value}–${next.value}` : `≥ ${step.value}`),
    };
  });

  const min = domain[0];
  const span = domain[domain.length - 1] - min;

  const colorAt = (value: number) => ramp(value).hex();

  // Downwards, so the first class that starts at or below the value wins and
  // the open-topped last class needs no upper bound to test against.
  const classAt = (value: number): ScaleClass => {
    const read =
      decimals === undefined ? value : Number(value.toFixed(decimals));
    for (let index = classes.length - 1; index > 0; index -= 1) {
      if (read >= classes[index].from) return classes[index];
    }
    return classes[0];
  };

  return {
    unit,
    breaks,
    classes,
    colorAt,
    classAt,
    // Both readings resolve through the same two functions above, so the colour
    // a card shows and the colour the surface paints are the same call with the
    // same argument — see the note on ColorScale.
    colorFor: (value, mode) =>
      mode === "step" ? classAt(value).color : colorAt(value),
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
 * No class names. PAGASA publishes these bands as amounts only, and naming
 * them here would be a classification the bulletin does not make — so the
 * popup and legend quote the total and its colour and say nothing more. The
 * percent-of-normal layer below is the one with published categories.
 */
export const RAINFALL_FORECAST_SCALE = buildScale("mm", [
  { value: 0, color: "#e1e1e1" },
  { value: 50, color: "#bee8ff" },
  { value: 100, color: "#01c5ff" },
  { value: 200, color: "#0071fe" },
  { value: 300, color: "#004da7" },
  { value: 400, color: "#002573" },
  { value: 500, color: "#000000" },
]);

/**
 * Percent of normal rainfall, where 100 is normal.
 *
 * Four classes, and PAGASA's own: "About our Rainfall Maps" publishes the whole
 * table — ≤40 way below normal, 41–80 below, 81–120 near, above 120 above — so
 * the popup, the legend and the surface say what the bulletin says and nothing
 * more. There is no "way above normal". The published table stops distinguishing
 * at 120, and the fifth class this file used to carry was invented to give the
 * ramp somewhere to go — which put a category in the legend PAGASA does not
 * issue.
 *
 * **The breaks are the class boundaries**, which is what ScaleBreak means: the
 * inclusive lower bound of a class and the ramp's stop position at once. They
 * were previously the band *midpoints* — 20/60/100/140/180 — which draws a
 * smoother ramp and classifies into the wrong band, by a whole category over
 * most of the domain: 50% came back "way below normal" against the bulletin's
 * below, 90% "below normal" against near, 130% "near normal" against above.
 * A midpoint table cannot be fixed by recolouring it; the numbers are what
 * `classAt` reads.
 *
 * 0 is the floor because the quantity has one — a month with no rain at all is
 * 0% of normal and nothing is below it. PAGASA prints integer bands, so the
 * boundary is treated as the continuous break: a value of exactly 40.0 reads as
 * "Below normal" rather than joining the ≤40 class, which is the only reading
 * that leaves 40.5 with a class at all.
 *
 * The hexes are matched from that published legend, not from a symbology sheet —
 * CIS has shipped one for the forecast layer above and not for this one. They
 * are the four published colours in the published order; replace them if exact
 * values land, and nothing else here changes.
 *
 * What four classes mean for the raster (config/rasters `rasterPalette`): the
 * surface is quantised against a range running to 250 and this domain stops at
 * 120, so everything above clamps to the one blue. That is the correct picture
 * rather than a gap to paper over — above normal is above normal, and the
 * bulletin draws no line inside it.
 */
export const RAINFALL_PERCENT_OF_NORMAL_SCALE = buildScale("%", [
  { value: 0, color: "#e0301f", label: "Way below normal", tag: "WBN" },
  { value: 40, color: "#f4f04f", label: "Below normal", tag: "BN" },
  { value: 80, color: "#3d8b2e", label: "Near normal", tag: "NN" },
  { value: 120, color: "#2323d9", label: "Above normal", tag: "AN" },
]);

/**
 * The three outcomes of a probabilistic rainfall forecast: above, near and
 * below normal. The order is the order they stack in, wettest on top, as the
 * published legend draws them.
 */
export const TERCILES = ["above", "near", "below"] as const;
export type Tercile = (typeof TERCILES)[number];

/** PAGASA's own abbreviations for the three outcomes. */
export const TERCILE_TAGS: Record<Tercile, string> = {
  above: "AN",
  near: "NN",
  below: "BN",
};

/**
 * A lighter or darker shade of a published colour, for a band the published
 * legend has no label for.
 *
 * The tercile legends label thresholds, not bands: "40" sits on the edge
 * between two swatches. So the swatch below the first threshold and the one
 * past the last are out-of-range colours, and they are drawn one shade off
 * their neighbour rather than copied: one chroma step lands on or next to the
 * legend's own end swatches (#b1f8fb brightens to #e5ffff against a published
 * #e6fcfc), and deriving them keeps each end tied to the colour beside it if
 * that colour is ever corrected.
 */
const lighter = (color: string) => chroma(color).brighten(1).hex();
const darker = (color: string) => chroma(color).darken(1).hex();

/**
 * What every tercile band means: a probability is a confidence in its outcome.
 * The outcome itself is named once per legend row, not repeated on each band.
 */
const TERCILE_BAND_LABEL = "Confidence";

/**
 * One tercile's probabilities as a scale: `[0, first)` is the lighter shade of
 * the first published colour, each threshold starts its own published band,
 * and the last threshold starts the darker shade of the colour before it.
 */
function tercileScale(
  first: number,
  step: number,
  colors: readonly string[],
): ColorScale {
  const last = first + step * colors.length;
  const label = TERCILE_BAND_LABEL;
  return buildScale("%", [
    { value: 0, color: lighter(colors[0]), label },
    ...colors.map((color, index) => ({
      value: first + step * index,
      color,
      label,
    })),
    { value: last, color: darker(colors[colors.length - 1]), label },
  ]);
}

/**
 * Rainfall tercile probabilities: how likely each of the three outcomes is.
 *
 * One scale per tercile rather than one table, because each has its own ramp:
 * blues for above normal, greens for near, yellow to red for below. Colours are
 * taken from PAGASA's probabilistic forecast legend (5-point bands from 40%)
 * by sampling each swatch. Near normal stops at 50% because PAGASA publishes
 * nothing higher for it: the middle outcome never gets that likely.
 *
 * These colour station markers only. CIS publishes the terciles per station and
 * nothing gridded, so the probabilistic layer has no surface to paint.
 */
export const RAINFALL_TERCILE_SCALES: Record<Tercile, ColorScale> = {
  // Bands 40–70; ≥ 75 is the darker shade.
  above: tercileScale(40, 5, [
    "#b1f8fb",
    "#8cd9fb",
    "#6dadf8",
    "#5076f6",
    "#3b44f3",
    "#3321f4",
    "#3016ee",
  ]),
  // Bands 40–45; ≥ 50 is the darker shade.
  near: tercileScale(40, 5, ["#7fac6f", "#557948"]),
  // Bands 40–70; ≥ 75 is the darker shade.
  below: tercileScale(40, 5, [
    "#f7ea92",
    "#ecb764",
    "#e3773f",
    "#df452c",
    "#dd3525",
    "#d73222",
    "#a12217",
  ]),
};

/**
 * Seasonal mean temperature, in °C.
 *
 * Station-only, and the one scale here with no polygon behind it: CIS publishes
 * seasonal temperature per station and not per province (docs/cis-api.md §5), so
 * this colours marker pills rather than a choropleth or a raster.
 *
 * The domain is the issuance's own. Every `tmean` CIS publishes nationally —
 * 324 values over 73 stations and six months — falls between 18.3 and 29.8, so
 * the table runs 18 to 30 in 3° steps and the ends clamp onto real extremes
 * rather than onto padding. That is tighter than an absolute temperature ramp
 * would be, and deliberately: a scale spanning 0–40 would render the whole
 * country in two indistinguishable oranges.
 *
 * Both the hexes and the words are **provisional** — PAGASA publishes a
 * symbology sheet for the seasonal rainfall layers and none for this one. The
 * ramp is the conventional cool-to-warm reading so that nothing has to be
 * learned to use it, and the words name the band rather than judging it: a 27°
 * month in Metro Manila is unremarkable, and whether a temperature is *unusual*
 * is `tmeanAnomaly`'s question, not this one's (TEMPERATURE_ANOMALY_SCALE
 * below) — the same division the two rainfall tables above keep.
 */
export const SEASONAL_TEMPERATURE_SCALE = buildScale("°C", [
  { value: 18, color: "#2c7bb6", label: "Cool" },
  { value: 21, color: "#abd9e9", label: "Mild" },
  { value: 24, color: "#ffffbf", label: "Warm" },
  { value: 27, color: "#fdae61", label: "Hot" },
  { value: 30, color: "#d7191c", label: "Very hot" },
]);

/**
 * Seasonal mean temperature anomaly: the signed departure from normal, in °C.
 *
 * Seven classes, and PAGASA's own — the words, the bounds and the colours are
 * copied from the temperature anomaly legend of the seasonal bulletin, the
 * hexes sampled from its swatches. Symmetric about zero: near average is
 * ±0.50, and each side steps out at 1 and 2 degrees.
 *
 * **Read at two decimals.** The legend is printed to two, and closes each class
 * on the side *nearer zero* — 0.50 is near average and 0.51 slightly above,
 * while −0.50 is near and −0.51 slightly below — which a lower-inclusive break
 * at ±0.50 cannot say for both signs. CIS publishes three decimals, so the
 * table classifies the value as printed to two (`decimals`), and each break is
 * the published lower bound in that precision: −2.00, −1.00, −0.50, then 0.51,
 * 1.01, 2.01 above zero. A figure then always sits in the class the legend
 * prints it under, and `range` carries the published bounds for the legend's
 * tooltip, since those breaks alone would derive "0.51–1.01".
 *
 * Near average is white, as published. Every consumer that draws a swatch on
 * a white panel gives it an edge (see isPale in utils/ink).
 */
export const TEMPERATURE_ANOMALY_SCALE = buildScale(
  "°C",
  [
    {
      // The floor is the domain's, not a published bound: nothing reads it but
      // the ramp, and the class runs down from −2.00 without end.
      value: -3,
      color: "#192670",
      label: "Way below average",
      range: "< −2.00",
    },
    {
      value: -2,
      color: "#4b72f5",
      label: "Below average",
      range: "−2.00 – −1.01",
    },
    {
      value: -1,
      color: "#9bddfa",
      label: "Slightly below average",
      range: "−1.00 – −0.51",
    },
    {
      value: -0.5,
      color: "#ffffff",
      label: "Near average",
      range: "−0.50 – 0.50",
    },
    {
      value: 0.51,
      color: "#efc1bf",
      label: "Slightly above average",
      range: "0.51 – 1.00",
    },
    {
      value: 1.01,
      color: "#dd3323",
      label: "Above average",
      range: "1.01 – 2.00",
    },
    {
      value: 2.01,
      color: "#921e14",
      label: "Way above average",
      range: "> 2.00",
    },
  ],
  { decimals: 2 },
);

/**
 * One class of a published classification that is *named* rather than
 * measured: a unit is in it or not, and there is no number behind it to place
 * on a ramp.
 *
 * Not a ColorScale. Everything that type does — breaks, ranges, `colorAt`
 * between stops, a legend printing the value each cell starts at — assumes a
 * quantity, and drought status is an ordered set of words. Faking one with
 * ordinals 0–3 would let a ramp invent a colour between "Dry spell" and
 * "Drought" and a legend print "2+".
 */
export type Category<K extends string = string> = {
  /** The published name, which is also the key the data is matched on. */
  label: K;
  /** The hex as published. Copied, never re-derived. */
  color: string;
  /** What the class means — the legend's tooltip. */
  description: string;
  /**
   * How much of this class's fill the map paints, as a share of its layer's
   * own opacity, when it should recede rather than stand level with the rest.
   * Absent is all of it. The legend always draws the published colour.
   */
  opacity?: number;
};

/**
 * Drought status, mildest first — the order CIS lists them in and the order the
 * legend reads.
 *
 * Hexes are CIS's `/drought/legend`, which docs/cis-api.md §5 says to use
 * verbatim. The descriptions are that legend's, shortened; its "Drought" row
 * opens "Dry spell is defined as…", a slip corrected here to the class it
 * describes.
 *
 * "Not affected" recedes. It is published as pure white, which the docs warn
 * reads as a hole against most basemaps — and at full strength it would also be
 * the loudest fill on a map whose news is the three classes above it, since in
 * most months it is most of the country. It keeps its colour and is painted at
 * a fraction of the others' strength: still told apart from a province the
 * month says nothing about, which is not painted at all, but no longer drawing
 * the eye away from the dry ones. The other three are exact.
 */
export const DROUGHT_STATUS_CLASSES: readonly Category<DroughtStatus>[] = [
  {
    label: "Not affected",
    color: "#ffffff",
    description: "Normal conditions",
    opacity: 0.35,
  },
  {
    label: "Dry condition",
    color: "#ffff00",
    description:
      "2 consecutive months of below-normal rainfall (21–30% below average)",
  },
  {
    label: "Dry spell",
    color: "#ffaa00",
    description:
      "3 consecutive months of below-normal rainfall (21–30% below average)",
  },
  {
    label: "Drought",
    color: "#a80000",
    description:
      "3 consecutive months of way-below-normal rainfall (over 60% below average)",
  },
];
