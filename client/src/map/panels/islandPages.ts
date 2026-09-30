import type { IslandGroup } from "@/map/config/islandGroups";
import type { ClassMembers, OverviewUnit } from "./overviewSummary";

/**
 * The expanded "By island group" list, cut into pages that each fit a given
 * height.
 *
 * The list is every island group's bar, and under it the group's places,
 * each marked with its percent-of-normal class's colour. It is sized to its
 * neighbour — the percent-of-normal section beside it sets the row's height —
 * so rather than scroll inside a scrolling panel it is paged: as many lines
 * as the row has room for, then the next page. The line heights below are
 * the ones the list draws with, which is what lets the packing be done in
 * arithmetic rather than by measuring rendered rows.
 *
 * A group split across pages has its name and bar repeated at the top of the
 * next, marked as continued, so no page starts with names under nothing.
 */

/** Heights in px, matched by the classes the list renders with. */
export const ISLAND_LINE = 64; // 8px, a 20px name, 4px, a 26px bar, 6px
/** Above every group but a page's first: 8px, then a 1px rule. */
export const SEPARATOR_LINE = 9;
export const NAME_LINE = 20;

/** Names per line: two columns, which the panel's half-width fits. */
export const NAME_COLUMNS = 2;

/** How a group's places are ordered: by name, or by class and then name. */
export type IslandSort = "name" | "class";

/** One place in the list, with the class its dot is painted in. */
export type ListedUnit = {
  unit: OverviewUnit;
  color: string;
  label: string;
};

export type PageIsland = {
  group: IslandGroup;
  /** The whole group's classes, for its bar, which is always drawn whole. */
  classes: ClassMembers[];
  total: number;
  /** The group's places on this page. */
  listed: ListedUnit[];
  /** Carried over from the page before. */
  continued: boolean;
};

export type IslandPage = PageIsland[];

/**
 * The groups laid onto pages of `capacity` px each.
 *
 * Each group's places are one list, whatever their class: the dot says the
 * class, and the bar above says how the classes add up. `sort` orders it by
 * name, or by class in the scale's order — the bar's, driest first — and by
 * name within each.
 *
 * Never fewer than one page. A capacity too small for a header and one line
 * is raised to that, so every page makes progress and the loop always ends.
 */
export function paginateIslands(
  islands: readonly {
    group: IslandGroup;
    classes: ClassMembers[];
    total: number;
  }[],
  capacity: number,
  sort: IslandSort,
): IslandPage[] {
  const room = Math.max(capacity, ISLAND_LINE + NAME_LINE);
  const pages: IslandPage[] = [];
  let page: IslandPage = [];
  let used = 0;

  const turn = () => {
    pages.push(page);
    page = [];
    used = 0;
  };

  for (const island of islands) {
    // Already by class, and by name within each (see islandDistributions).
    const entries: ListedUnit[] = island.classes.flatMap((cls) =>
      cls.units.map((unit) => ({ unit, color: cls.color, label: cls.label })),
    );
    if (sort === "name")
      entries.sort((a, b) => a.unit.name.localeCompare(b.unit.name));
    // A page's first group sits at its top; every later one is ruled off.
    const header = () => (page.length ? SEPARATOR_LINE : 0) + ISLAND_LINE;
    const open = (continued: boolean): PageIsland => {
      used += header();
      const opened = { ...island, listed: [], continued };
      page.push(opened);
      return opened;
    };

    // A group starts where its bar and its first line both fit.
    const lead = header() + (entries.length ? NAME_LINE : 0);
    if (page.length && used + lead > room) turn();
    let current = open(false);

    for (let at = 0; at < entries.length; at += NAME_COLUMNS) {
      if (used + NAME_LINE > room) {
        turn();
        current = open(true);
      }
      current.listed.push(...entries.slice(at, at + NAME_COLUMNS));
      used += NAME_LINE;
    }
  }

  if (page.length || pages.length === 0) pages.push(page);
  return pages;
}
