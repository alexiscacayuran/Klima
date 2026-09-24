import { CloudRain, Thermometer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CisProductName } from "@/api/products";
import type { AdminLevel } from "@/map/types/features";

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
 * the same arrangement RASTER_LAYERS uses for overlays. Products without
 * variables are the ones CIS has not published a mappable layer for yet; the
 * rail shows them with an honest empty state rather than hiding them, because
 * their absence from the list would read as "PAGASA does not make this".
 */

/**
 * The things a selected layer can put on the map.
 *
 * A vocabulary rather than a set of booleans, because the interesting fact is
 * the *combination*: a gridded surface under boundaries, the same plus station
 * points, or points alone with nothing behind them. Each of those is a real
 * published product shape, and spelling them as a list keeps a fourth from
 * needing a fourth flag.
 *
 * No `choropleth` yet. Painting admin polygons from their own values — with no
 * raster behind them — is the drought product's shape, and drought is not wired
 * up; layers/index.ts already reserves the slot in LAYER_ORDER. Declaring the
 * value before anything reads it would be config that does nothing, which is
 * exactly what this registry avoids elsewhere.
 */
export const OVERLAYS = ["raster", "boundaries", "stations"] as const;
export type Overlay = (typeof OVERLAYS)[number];

export type ProductLayer = {
  /** Stable id, unique within its variable. */
  id: string;
  label: string;
  /** What this layer draws; see the note on ProductDefinition.overlays. */
  overlays?: readonly Overlay[];
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
  /** What this variable draws; see the note on ProductDefinition.overlays. */
  overlays?: readonly Overlay[];
};

export type ProductDefinition = {
  /** Stable id; also the accordion's open/closed key. */
  id: string;
  label: string;
  /**
   * The administrative tier the product publishes at — which is what the map
   * has to resolve to for it, and therefore which pair of boundary levels it
   * draws (see boundaryLevels). Seasonal rainfall is issued per province, so
   * selecting it puts provinces on the map and regions around them.
   *
   * A property of the *product*, not of a variable: an issuance is published at
   * one resolution and every quantity in it shares that resolution. Absent
   * until CIS confirms one — the fallback is DEFAULT_SPATIAL_LEVEL, and
   * guessing here would silently change what the map hit-tests.
   */
  spatialLevel?: AdminLevel;
  /**
   * The CIS dataset this bulletin's data comes from, when there is one.
   *
   * Two vocabularies meet here. The rail lists the bulletins PAGASA publishes —
   * which is what a user came to look at, and stays listed whether or not CIS
   * has loaded it — while the API knows four datasets by names that are also
   * the strings its auth middleware scopes a token on (docs/cis-api.md §2). The
   * overlap is partial and not one-to-one: "10-day Forecast" is not `fiveday`,
   * and no rail entry corresponds to `drought` or `daily-monitoring` yet.
   *
   * Absent means the rail shows the product but nothing fetches for it: no
   * dates on the timeline, no choropleth. That is the honest state for a
   * bulletin CIS has not published an endpoint for, and it is why this is
   * optional rather than defaulted to a guess — a wrong name here would send
   * every request for the product to a dataset about something else.
   */
  cisProduct?: CisProductName;
  /**
   * What a selection draws — the surface, the boundaries, the station points,
   * or some combination.
   *
   * Declarable at all three levels and resolved innermost-first, which is the
   * opposite arrangement to `spatialLevel` above and for a reason. Resolution is
   * a property of the *issuance*: it is published at one tier and every quantity
   * in it shares that tier, so a variable cannot disagree with its product.
   * Composition is not. One seasonal issuance publishes a gridded rainfall
   * surface and nothing gridded for temperature at all, so two layers of one
   * product genuinely draw different things, and the product has no single
   * answer to give.
   *
   * Absent at every level falls back to DEFAULT_OVERLAYS rather than to nothing,
   * because a product with no declaration is one nobody has got to yet — not one
   * that has been decided to draw an empty map.
   */
  overlays?: readonly Overlay[];
  /** Empty or absent until CIS publishes a mappable layer for the product. */
  variables?: readonly ProductVariable[];
};

export const PRODUCTS: readonly ProductDefinition[] = [
  { id: "farm-weather", label: "Farm Weather Forecast" },
  {
    id: "ten-day",
    label: "10-day Forecast",
    spatialLevel: 3,
    cisProduct: "fiveday",
    variables: [
      {
        id: "rainfall",
        label: "Rainfall",
        icon: CloudRain,
      },
      // No layers: `/fiveday` publishes one rainfall reading per unit. Give it
      // sub-layers when CIS publishes a second mappable one, not before.
    ],
  },
  { id: "s2s", label: "S2S Forecast" },
  {
    id: "seasonal",
    label: "Seasonal Forecast",
    // `GET /seasonal` resolves a location to provinces and publishes one row per
    // province per month; the station shape is the same issuance at points, not
    // a finer polygon tier. See docs/cis-api.md §5.
    spatialLevel: 2,
    // The one rail entry the API has a dataset for today. Its name happens to
    // match the rail's own id; the others do not, which is why the two are
    // separate fields rather than one.
    cisProduct: "seasonal",
    variables: [
      {
        id: "rainfall",
        label: "Rainfall",
        icon: CloudRain,
        layers: [
          {
            id: "forecast",
            label: "Forecast",
            overlays: ["raster", "boundaries", "stations"],
          },
          {
            id: "percent-of-normal",
            label: "Percent of Normal",
            overlays: ["raster", "boundaries", "stations"],
          },
          // Stations alone, like temperature: the tercile probabilities are
          // published per station only, and the layer has no surface of its own —
          // borrowing percent of normal's would put a legend beside the pills
          // that describes different colours from theirs.
          {
            id: "probabilistic-forecast",
            label: "Probabilistic Forecast",
            overlays: ["stations"],
          },
        ],
      },
      // No layers: the province endpoint carries no temperature at all, and the
      // station shape publishes one seasonal temperature. Give it sub-layers
      // when CIS publishes a second mappable one, not before.
      //
      // Stations alone, and the only selection in the catalogue that draws no
      // polygons: with nothing published per province there is nothing to paint
      // them from, and drawing them anyway would offer a hit target that can
      // never answer. The rail row is the leaf here, so the declaration sits on
      // the variable.
      {
        id: "temperature",
        label: "Temperature",
        icon: Thermometer,
        overlays: ["stations"],
      },
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

/** The product half of a `variableKey` — the first segment, always present. */
export const productIdFromKey = (key: string): string => key.split(":")[0];

/** A `variableKey` taken apart again. */
export type VariableKeyParts = {
  productId: string;
  variableId: string;
  /** Absent for a variable whose row is itself the selection. */
  layerId?: string;
};

/**
 * The three ids behind a selection, or null when there is no selection.
 *
 * The inverse of `variableKey`, and the only thing that should undo it: a key
 * is one string precisely so nothing passes the segments around separately, and
 * a caller that needs them back — to ask which quantity a layer is about — gets
 * them here rather than by splitting on a colon of its own.
 *
 * A key with no variable segment is not a selection at all; it is returned as
 * null rather than as a product with an empty variable, so callers branch once.
 */
export const parseVariableKey = (
  key: string | null,
): VariableKeyParts | null => {
  if (!key) return null;
  const [productId, variableId, layerId] = key.split(":");
  if (!variableId) return null;
  return { productId, variableId, layerId };
};

export const findProduct = (productId: string): ProductDefinition | undefined =>
  PRODUCTS.find((product) => product.id === productId);

/**
 * Boundaries, for a selection that has not declared what it draws.
 *
 * The frame rather than the data: boundaries are what every product in the
 * catalogue has in common, and they are the tier a click resolves against, so a
 * product nobody has configured yet still shows a map that can be pointed at.
 * Defaulting to `raster` instead would promise a surface that mostly does not
 * exist — only seasonal publishes one.
 */
export const DEFAULT_OVERLAYS: readonly Overlay[] = ["boundaries"];

/**
 * What a selected layer draws.
 *
 * Innermost declaration wins — layer, then variable, then product — so a product
 * can state the shape its variables mostly share and one variable can disagree
 * without restating the rest. Not merged across levels: a partial override would
 * make removing an overlay impossible to express, and "stations only" is exactly
 * that case.
 */
export function overlaysForVariable(key: string | null): readonly Overlay[] {
  const parts = parseVariableKey(key);
  if (!parts) return DEFAULT_OVERLAYS;

  const product = findProduct(parts.productId);
  const variable = product?.variables?.find(
    (candidate) => candidate.id === parts.variableId,
  );
  const layer = parts.layerId
    ? variable?.layers?.find((candidate) => candidate.id === parts.layerId)
    : undefined;

  return (
    layer?.overlays ??
    variable?.overlays ??
    product?.overlays ??
    DEFAULT_OVERLAYS
  );
}

/** Whether a selected layer draws one particular overlay. */
export const hasOverlay = (key: string | null, overlay: Overlay): boolean =>
  overlaysForVariable(key).includes(overlay);

/**
 * Whether a selected layer draws station points and nothing else.
 *
 * The case where the stations are not an overlay on the data but the data
 * itself — seasonal temperature and the rainfall terciles. Hiding them would
 * leave an empty map with a legend beside it, so the station switch is held on
 * for these rather than offered.
 */
export const publishesStationsOnly = (key: string | null): boolean => {
  const overlays = overlaysForVariable(key);
  return overlays.length > 0 && overlays.every((overlay) => overlay === "stations");
};

/**
 * Provinces, for a product that has not declared its own resolution.
 *
 * Every CIS product that publishes polygons publishes at province level —
 * drought, five-day and seasonal all resolve a location to provinces — so this
 * is the shape of the data rather than an arbitrary default. Daily monitoring
 * is the exception, and it is points, not polygons.
 */
export const DEFAULT_SPATIAL_LEVEL: AdminLevel = 2;

/**
 * The tier the map should resolve to for a selected layer.
 *
 * Keyed off the *selected* variable rather than the expanded accordion product,
 * because expanding a product paints nothing — only the innermost row does, and
 * the boundaries have to agree with what is painted rather than with what the
 * rail happens to be showing.
 */
export function spatialLevelForVariable(key: string | null): AdminLevel {
  if (!key) return DEFAULT_SPATIAL_LEVEL;
  return (
    findProduct(productIdFromKey(key))?.spatialLevel ?? DEFAULT_SPATIAL_LEVEL
  );
}

/**
 * The CIS dataset behind a selected layer, if it has one.
 *
 * Keyed off the *selected* variable rather than the expanded accordion product,
 * for the same reason spatialLevelForVariable is: expanding a product fetches
 * nothing, and only the innermost row decides what the map is asking CIS about.
 */
export function cisProductForVariable(
  key: string | null,
): CisProductName | undefined {
  if (!key) return undefined;
  return findProduct(productIdFromKey(key))?.cisProduct;
}

/** What the map opens on: the product the rail expands and the layer it paints. */
export const DEFAULT_PRODUCT_ID = "seasonal";
export const DEFAULT_VARIABLE_ID = "rainfall";
export const DEFAULT_LAYER_ID = "forecast";
