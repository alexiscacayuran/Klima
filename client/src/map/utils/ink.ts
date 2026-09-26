import chroma from "chroma-js";

/**
 * The two inks text over a data colour can take. Fixed rather than theme
 * tokens: they are read against the data colours, which do not change with the
 * theme.
 *
 * Pure black and white rather than the theme's near-black, because the pair is
 * the safeguard: whichever of the two contrasts more with a colour clears
 * 4.58:1 against *any* colour — past WCAG AA's 4.5 for small text — so a fill
 * added or corrected later cannot leave a figure unreadable. A near-black ink
 * lets the worst case slip under 4.5.
 */
const INK_LIGHT = "#ffffff";
const INK_DARK = "#000000";

/**
 * Whichever ink contrasts more with the colour.
 *
 * Chosen per colour rather than one ink with a halo: the tables run from
 * near-white through yellow to pure black, so no single ink reads on all of
 * them, and a text shadow legible on #e1e1e1 is a smudge on #002573.
 */
export const inkOn = (color: string): string =>
  chroma.contrast(color, INK_LIGHT) >= chroma.contrast(color, INK_DARK)
    ? INK_LIGHT
    : INK_DARK;
