import type { IslandGroup } from "@/api/constants";

export { ISLAND_GROUPS } from "@/api/constants";
export type { IslandGroup } from "@/api/constants";

/** Short tags for a ranked row, where the whole name would crowd the place's. */
export const ISLAND_GROUP_TAGS: Record<IslandGroup, string> = {
  Luzon: "LZN",
  Visayas: "VIS",
  Mindanao: "MIN",
};

/**
 * Region digits to island group — the first two digits of any PSGC — for rows
 * that do not say which they are in.
 *
 * `/stations` and `/locations` both carry an `islandGroup` field, parsed at
 * their fetch boundaries (api/stations, api/locations), and a station's group
 * is read from there. The seasonal *province* rows carry none, so for them the
 * group is read off the region digits instead. That is the rule CIS itself
 * assigns the field by (docs/cis-api.md §5), and this table agrees with the
 * `islandGroup` of every one of the 1,758 `/locations` rows, so the two cannot
 * disagree about a province. It costs no request: the alternative join is the
 * whole 228 KB list, for a fact the code already holds.
 *
 * NCR, CAR and MIMAROPA are Luzon, as PSA groups them. The Negros Island
 * Region (18) is Visayas: its provinces came out of Western and Central
 * Visayas. Bangsamoro (19) and Caraga (16) are Mindanao.
 */
const REGION_ISLAND_GROUP: Record<string, IslandGroup> = {
  "01": "Luzon",
  "02": "Luzon",
  "03": "Luzon",
  "04": "Luzon",
  "05": "Luzon",
  "13": "Luzon",
  "14": "Luzon",
  "17": "Luzon",
  "06": "Visayas",
  "07": "Visayas",
  "08": "Visayas",
  "18": "Visayas",
  "09": "Mindanao",
  "10": "Mindanao",
  "11": "Mindanao",
  "12": "Mindanao",
  "16": "Mindanao",
  "19": "Mindanao",
};

/**
 * The island group a PSGC is in, at any level — a region, a province or a
 * city all carry their region in the same two digits. Null for a code this
 * table does not know, which is left out of any grouping rather than guessed.
 */
export const islandGroupOf = (psgc: string): IslandGroup | null =>
  REGION_ISLAND_GROUP[psgc.slice(0, 2)] ?? null;
