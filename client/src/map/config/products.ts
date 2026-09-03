import { CloudRain, Thermometer } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The PAGASA product catalogue the left rail lists.
 *
 * Mirrors the CIS lifecycle vocabulary: a *product* is a published climate
 * bulletin (Seasonal Forecast, 10-day Forecast, …), a *variable* is one measured
 * quantity inside it, and a *layer* is one way that variable is mapped. Only the
 * leaf is a map layer — picking "Seasonal Forecast → Rainfall → Percent of
 * Normal" is what selects what the choropleth paints, and a variable with no
 * layers of its own is that leaf itself.
 *
 * A registry rather than JSX so the rail needs no edit when a product lands,
 * the same arrangement WEATHER_LAYERS uses for overlays. Products without
 * variables are the ones CIS has not published a mappable layer for yet; the
 * rail shows them with an honest empty state rather than hiding them, because
 * their absence from the list would read as "PAGASA does not make this".
 */

export type ProductLayer = {
  /** Stable id, unique within its variable. */
  id: string;
  label: string;
};

export type ProductVariable = {
  /** Stable id, unique within its product. */
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * The distinct quantities CIS publishes for the variable, when there is more
   * than one. Seasonal rainfall arrives as both a forecast total (`rainfallMean`,
   * mm) and a percent of normal (`rainfallPn`) — two different choropleths off
   * one variable, not two units of one number, so each is its own selectable
   * layer. Absent when the variable maps to a single layer; the rail then makes
   * the variable row itself the selection.
   */
  layers?: readonly ProductLayer[];
};

export type ProductDefinition = {
  /** Stable id; also the accordion's open/closed key. */
  id: string;
  label: string;
  /** Empty or absent until CIS publishes a mappable layer for the product. */
  variables?: readonly ProductVariable[];
};

export const PRODUCTS: readonly ProductDefinition[] = [
  { id: "farm-weather", label: "Farm Weather Forecast" },
  { id: "ten-day", label: "10-day Forecast" },
  { id: "s2s", label: "S2S Forecast" },
  {
    id: "seasonal",
    label: "Seasonal Forecast",
    variables: [
      {
        id: "rainfall",
        label: "Rainfall",
        icon: CloudRain,
        layers: [
          { id: "forecast", label: "Forecast" },
          { id: "percent-of-normal", label: "Percent of Normal" },
        ],
      },
      // No layers: the province endpoint carries no temperature at all, and the
      // station shape publishes one seasonal temperature. Give it sub-layers
      // when CIS publishes a second mappable one, not before.
      { id: "temperature", label: "Temperature", icon: Thermometer },
    ],
  },
  { id: "enso", label: "El Niño / La Niña" },
  { id: "projections", label: "Climate Projections" },
  { id: "climatology", label: "Climatology" },
];

/**
 * One key for a selection that is only unique across every level — variable ids
 * repeat between products and layer ids repeat between variables, so neither
 * "rainfall" nor "forecast" alone identifies what the map paints.
 *
 * The layer segment is omitted for a variable that has none, so a single-layer
 * variable keeps the two-part key it had.
 */
export const variableKey = (
  productId: string,
  variableId: string,
  layerId?: string,
) =>
  layerId
    ? `${productId}:${variableId}:${layerId}`
    : `${productId}:${variableId}`;

/** What the map opens on: the product the rail expands and the layer it paints. */
export const DEFAULT_PRODUCT_ID = "seasonal";
export const DEFAULT_VARIABLE_ID = "rainfall";
export const DEFAULT_LAYER_ID = "forecast";

/**
 * The six-month window the seasonal timeline scrubs through.
 *
 * Hard-coded to the design's sample issuance (Sep 2026 – Feb 2027) because the
 * real window is a property of the *issuance*, not of the app: CIS publishes a
 * lead time per bulletin, and the months move every time a forecast is issued.
 * Replace with the API's month list once the seasonal endpoint is wired — see
 * docs/cis-api.md — and delete this constant rather than editing it monthly.
 */
export const SEASONAL_OUTLOOK_MONTHS = [
  { id: "2026-09", label: "Sep" },
  { id: "2026-10", label: "Oct" },
  { id: "2026-11", label: "Nov" },
  { id: "2026-12", label: "Dec" },
  { id: "2027-01", label: "Jan" },
  { id: "2027-02", label: "Feb" },
] as const;

export const DEFAULT_MONTH_ID = "2026-10";
