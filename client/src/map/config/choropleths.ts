import chroma from "chroma-js";
import type { DroughtSeries, DroughtStatus } from "@/api/drought";
import type { CisProductName } from "@/api/products";
import type { Category } from "./colorScales";
import { DROUGHT_STATUS_CLASSES } from "./colorScales";
import { cisProductForVariable, parseVariableKey } from "./products";

/**
 * The choropleth contract: which selected layers fill the admin polygons from
 * their own published classes, and how.
 *
 * The counterpart of config/rasters.ts for a product published per unit rather
 * than gridded, and shaped like it on purpose — a registry of variants, a hook
 * that resolves the selected one (hooks/useChoropleth), and one overlay that
 * paints whichever it is (layers/ChoroplethOverlay) — so the legend, the
 * timeline's thumbnails and the popup ask one question and get one answer.
 *
 * Drought is the only product with this shape today.
 */
export type ChoroplethVariant = {
  /** The dataset the fills come from. */
  product: CisProductName;
  /** Which endpoint, and so which run of months, this layer maps. */
  series: DroughtSeries;
  /** What a reader calls one month of it, for the popup: "assessment". */
  noun: string;
  /**
   * What heads the legend's bar, in the slot a numeric legend gives its unit:
   * the name of the scale, since a classification has no unit.
   */
  unit: string;
  /** The published classes, in legend order. */
  classes: readonly Category<DroughtStatus>[];
  /** How much of the basemap shows through — the raster's own 0.8. */
  opacity: number;
};

/**
 * Keyed by the variable and layer segments of a `variableKey`, without the rail
 * product — the reverse of RASTER_VARIANTS, and for a reason: the rail entry a
 * dataset is listed under is a question of how PAGASA's bulletins are grouped,
 * and moving Drought to another entry should not mean re-keying its map. The
 * dataset is checked instead (see choroplethVariantFor).
 */
const CHOROPLETH_VARIANTS: Record<string, ChoroplethVariant> = {
  "drought:assessment": {
    product: "drought",
    series: "assessment",
    noun: "assessment",
    unit: "Status",
    classes: DROUGHT_STATUS_CLASSES,
    opacity: 1,
  },
  "drought:outlook": {
    product: "drought",
    series: "outlook",
    noun: "outlook",
    unit: "Status",
    classes: DROUGHT_STATUS_CLASSES,
    opacity: 1,
  },
};

/**
 * The choropleth a selected layer is about, or null if it publishes none.
 *
 * Null too when the layer's rail product is backed by a different dataset than
 * the variant names: a "drought" variable under some product that fetches
 * seasonal would otherwise ask the drought endpoints for a map nobody chose.
 */
export function choroplethVariantFor(
  key: string | null,
): ChoroplethVariant | null {
  const parts = parseVariableKey(key);
  if (!parts?.layerId) return null;
  const variant = CHOROPLETH_VARIANTS[`${parts.variableId}:${parts.layerId}`];
  return variant && cisProductForVariable(key) === variant.product
    ? variant
    : null;
}

/**
 * The class a status belongs to.
 *
 * Every status has one by construction — the classes and the statuses are the
 * same four names — so the lookup cannot miss for a status the API module let
 * through.
 */
export const categoryOf = (
  variant: ChoroplethVariant,
  status: DroughtStatus,
): Category<DroughtStatus> =>
  variant.classes.find((category) => category.label === status) ??
  variant.classes[0];

/**
 * A class's colour as the map paints it: the published hex at the class's own
 * share of the fill, as a CSS colour with alpha.
 *
 * One function for the overlay and the timeline's thumbnails, so a receding
 * class recedes in both. The legend and the popup's swatch do not use it —
 * they quote the published colour, as a key should.
 */
export const paintColor = (category: Category): string =>
  category.opacity === undefined
    ? category.color
    : chroma(category.color).alpha(category.opacity).css();
