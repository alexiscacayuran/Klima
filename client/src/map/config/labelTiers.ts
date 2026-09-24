import type { PropertyValueSpecification } from "maplibre-gl";
import { FONTS } from "./styles";
import type { AdminLevel } from "@/map/types/features";

/**
 * One scale for every label on the map, in two bands.
 *
 * There are two label systems here — the basemap's place names, kept from
 * OpenStreetMap (utils/basemapStyle), and the administrative names the app
 * derives itself (sources/AdminBoundaries) — and they have to read as one
 * system while never being mistaken for each other. So they share a face, a
 * case and a halo, and differ in exactly two things: **colour and size**.
 *
 * The first thing those two say is which band a label is in. The administrative
 * names are the subject of this map: they name the units the selected product
 * publishes for, they are what a click resolves to, and they are the only labels
 * a reading is ever attached to. Everything OpenStreetMap contributes is context
 * — it tells you which part of the country you are looking at, and then gets out
 * of the way. So ADMIN_TIERS is bright and PLACE_TIERS is *significantly*
 * darker, with a wide gap between the two, and no OSM label is ever as light as
 * the quietest administrative one.
 *
 * The second thing they say is the tier within a band: the larger the unit, the
 * bigger and lighter its name. A region carries more of the country than a
 * municipality does, so it is stated more loudly.
 *
 * Dark-first, like BOUNDARY_INK in sources/AdminBoundaries and for the same
 * reason: both bands descend from white, which recedes against the Dark
 * basemap's rgb(12,12,12) ground and does the opposite on Light. Whichever
 * basemap this map is really for is one ramp, here.
 */

/**
 * The zoom stops every size ramp is written at.
 *
 * Three, and the same three for every tier, so a tier is a row of numbers that
 * can be read against its neighbours rather than a curve that has to be
 * imagined. z5 is the country in frame, z14 is the deepest the boundary source
 * serves.
 */
export const LABEL_SIZE_STOPS = [5, 9, 14] as const;

/** Text size at LABEL_SIZE_STOPS, in px. */
type SizeRamp = readonly [number, number, number];

type AdminTierStyle = {
  /** Text colour. The place band has one ink and needs no equivalent. */
  color: string;
  size: SizeRamp;
};

/* ------------------------------------------------------------------ *
 * The bright band: what the map is about.
 * ------------------------------------------------------------------ */

/** Largest and lightest first. */
export const ADMIN_TIER_ORDER = ["region", "province", "municipality"] as const;
export type AdminTier = (typeof ADMIN_TIER_ORDER)[number];

/**
 * Only one of these is ever on screen: the label layer draws the product's own
 * spatial resolution and nothing else. The gradation is therefore between
 * *products* rather than within a view — a level-3 product's names are smaller
 * and a shade quieter than a level-2 product's, because a municipality is a
 * smaller claim than a province, and the map should feel correspondingly closer
 * in without the reader having to check a control to know it.
 */
export const ADMIN_TIERS: Record<AdminTier, AdminTierStyle> = {
  /** Administrative level 1. */
  region: { color: "#ffffff", size: [11.5, 13.5, 15.5] },
  /** Administrative level 2 — the seasonal forecast's resolution. */
  province: { color: "#f0f4f8", size: [11, 13, 15] },
  /** Administrative level 3: cities and municipalities. */
  municipality: { color: "#dde4ec", size: [10, 12, 14] },
};

const ADMIN_LEVEL_TIERS: Record<AdminLevel, AdminTier> = {
  1: "region",
  2: "province",
  3: "municipality",
};

/** Which tier the app's own labels take, given the level the product publishes at. */
export const tierForAdminLevel = (level: AdminLevel): AdminTier =>
  ADMIN_LEVEL_TIERS[level];

/* ------------------------------------------------------------------ *
 * The dark band: where you are, and nothing more.
 * ------------------------------------------------------------------ */

export const PLACE_TIER_ORDER = [
  "country",
  "subnational",
  "city",
  "town",
  "village",
  "locality",
  "micro",
] as const;
export type PlaceTier = (typeof PLACE_TIER_ORDER)[number];

/**
 * One ink for every place name, whatever tier it is on.
 *
 * The band separation is the whole job here, and colour is how it is made: a
 * single warm grey, far below the administrative band, so that no place name is
 * ever mistaken for a unit the current product publishes for. Grading the place
 * names against each other as well would spend contrast on a distinction nobody
 * is reading — between a town and a village — at the cost of the one that
 * matters, which is between context and subject.
 *
 * So the place band says its own hierarchy in size alone, and says it quietly.
 *
 * Warm rather than the slate the administrative band descends from, which is the
 * other half of telling them apart: even at a glance, and even where a city name
 * sits right beside a province name, the two are different inks rather than two
 * steps of one.
 */
export const PLACE_INK = "#89857E";

/**
 * Size alone, descending with the size of the thing named.
 *
 * Every one of these is smaller than every administrative tier, so the two bands
 * are separated twice over — once in colour, once in size — and a reader does
 * not have to resolve which system a label came from to know how much weight to
 * give it.
 */
export const PLACE_TIERS: Record<PlaceTier, SizeRamp> = {
  /**
   * Only ever "Philippines", and only at z6 and below — OpenFreeMap caps the
   * country layers there, so it shows when the whole country is in frame and
   * nowhere else.
   */
  country: [11, 12.5, 13.5],
  /**
   * OSM `state`, `province` and `island`. OSM publishes no state or province
   * inside the Philippines — the nearest is Sabah — so in practice this rung is
   * islands, and only if a layer is ever added for them.
   */
  subnational: [10, 11.5, 13],
  /** OSM `city`: Manila, Cebu City, Davao City, Iloilo City, Baguio. */
  city: [9.5, 11, 12.5],
  /** OSM `town`: the municipalities — Daet, Sablayan, Bulan, Virac. */
  town: [9, 10, 11.5],
  /** OSM `village`. */
  village: [8.5, 9.5, 11],
  /** OSM `suburb` and `hamlet` — Cupang, Tipas, Salawag. */
  locality: [8, 9, 10.5],
  /** OSM `neighbourhood`, `quarter` and `isolated_dwelling`: barangay scale. */
  micro: [7.5, 8.5, 10],
};

/**
 * Which tier an OpenStreetMap `place` class is labelled at.
 *
 * Keyed on the tile property rather than on layer id, because the two basemaps
 * name the same layers differently — `place_city` against `label_city` — and the
 * class is the thing both are really filtering on.
 *
 * `quarter` and `island` are in the tiles but no kept layer renders them; they
 * are mapped anyway so that enabling such a layer is a style change rather than
 * a style change plus a silent fallback.
 */
export const PLACE_CLASS_TIERS: Record<string, PlaceTier> = {
  country: "country",
  state: "subnational",
  province: "subnational",
  island: "subnational",
  city: "city",
  town: "town",
  village: "village",
  suburb: "locality",
  hamlet: "locality",
  quarter: "micro",
  neighbourhood: "micro",
  isolated_dwelling: "micro",
};

/** The tier anything unmapped falls back to: present, but at the quietest rung. */
const FALLBACK_TIER: PlaceTier = "micro";

/* ------------------------------------------------------------------ *
 * What both bands share.
 * ------------------------------------------------------------------ */

/**
 * The face every label is set in.
 *
 * One face because the two bands already carry the hierarchy in colour and size
 * — adding weight to it would say the same thing a third time and less clearly.
 * Bold rather than regular because the bottom of the place band is small and
 * dark over a basemap that will eventually have a raster under it, and
 * regular does not survive that.
 *
 * Case is the other half of "one system": the basemap ships every place label
 * uppercased and the administrative names are proper nouns in sentence case, so
 * the transform is stripped rather than adopted (see utils/basemapStyle).
 */
export const LABEL_FONT: string[] = [...FONTS.bold];

/**
 * Shared halo. Not part of either ramp — every label gets the same one.
 *
 * The labels are the one thing on this map that must stay legible over a surface
 * nobody controls, and the halo is the only mark here that is on no ramp: its
 * job is to be whatever the text is not.
 */
export const LABEL_HALO = "rgba(6, 10, 16, 0.55)";
export const LABEL_HALO_WIDTH = 1.4;
export const LABEL_HALO_BLUR = 0.6;

/**
 * `text-size` for a tier that is fixed for the whole layer.
 *
 * A top-level `interpolate` on zoom, which is the only place `["zoom"]` is legal
 * — wrapping one in arithmetic makes MapLibre reject the property and drop the
 * layer.
 */
function sizeRamp(size: SizeRamp): PropertyValueSpecification<number> {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    LABEL_SIZE_STOPS[0],
    size[0],
    LABEL_SIZE_STOPS[1],
    size[1],
    LABEL_SIZE_STOPS[2],
    size[2],
  ];
}

export const adminTextSize = (tier: AdminTier) =>
  sizeRamp(ADMIN_TIERS[tier].size);

/**
 * A unit's reading, set under its name: a step smaller, so it reads as a
 * statement about the place rather than as a second place.
 */
export const ADMIN_VALUE_SCALE = 0.85;

/** The reading's size at LABEL_SIZE_STOPS, in px. */
export const adminValueSize = (tier: AdminTier): SizeRamp => {
  const [a, b, c] = ADMIN_TIERS[tier].size;
  return [a * ADMIN_VALUE_SCALE, b * ADMIN_VALUE_SCALE, c * ADMIN_VALUE_SCALE];
};

export const adminValueTextSize = (tier: AdminTier) =>
  sizeRamp(adminValueSize(tier));

/**
 * A style expression, before it is handed to a typed property slot.
 *
 * maplibre-gl re-exports `PropertyValueSpecification` but not the expression
 * union inside it, so an expression *built* rather than written inline cannot be
 * given its real type here. The two functions below therefore assert on the way
 * out, and the assertion is not taken on trust: both are run through MapLibre's
 * own `validateStyleMin` in the checks for this module, which is the same
 * validator that would reject them at runtime.
 */
type BuiltExpression = unknown[];

const classMatch = <T>(pick: (tier: PlaceTier) => T): BuiltExpression => [
  "match",
  ["get", "class"],
  ...Object.entries(PLACE_CLASS_TIERS).flatMap(([placeClass, tier]) => [
    placeClass,
    pick(tier),
  ]),
  pick(FALLBACK_TIER),
];

/**
 * `text-size` keyed on the feature's own `class`.
 *
 * One expression for every kept basemap layer, rather than one per layer: each
 * of those layers already filters to a single class, so the match resolves to a
 * constant for each — but written this way, the transform does not have to know
 * which layer is which, and a basemap that splits its classes differently gets
 * the same ramp for free.
 *
 * The `match` sits at each zoom stop rather than around the whole ramp, for the
 * same reason sizeRamp is shaped the way it is.
 */
export function placeClassTextSize(): PropertyValueSpecification<number> {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    LABEL_SIZE_STOPS[0],
    classMatch((tier) => PLACE_TIERS[tier][0]),
    LABEL_SIZE_STOPS[1],
    classMatch((tier) => PLACE_TIERS[tier][1]),
    LABEL_SIZE_STOPS[2],
    classMatch((tier) => PLACE_TIERS[tier][2]),
  ] as unknown as PropertyValueSpecification<number>;
}
