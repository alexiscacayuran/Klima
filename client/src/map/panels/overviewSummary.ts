import { seasonalMonth, seasonalStationMonth } from "@/api/seasonal";
import { stationShortName } from "@/api/stations";
import {
  RAINFALL_PERCENT_OF_NORMAL_SCALE,
  TEMPERATURE_ANOMALY_SCALE,
  TERCILES,
} from "@/map/config/colorScales";
import type { Tercile } from "@/map/config/colorScales";
import { ISLAND_GROUPS, islandGroupOf } from "@/map/config/islandGroups";
import type { IslandGroup } from "@/map/config/islandGroups";
import {
  dominantTercile,
  finite,
  tercileProbabilities,
} from "@/map/config/seasonalReadings";
import type { SeasonalProvinceIndex } from "@/map/hooks/useSeasonalProvinces";
import type { SeasonalStationIndex } from "@/map/hooks/useSeasonalStations";

/**
 * The overview's arithmetic: one month of the seasonal issuance, nationally,
 * counted and ranked.
 *
 * Apart from the panel so the panel stays a renderer, and because every figure
 * on it is a count of something the map already paints. The classes are the
 * percent-of-normal layer's own (config/colorScales), so "near normal" on the
 * donut is the same band the choropleth paints green; nothing here invents a
 * category the legend does not show.
 *
 * Provinces and stations reduce to one shape, OverviewUnit, so each section is
 * written once and reads whichever resolution the panel is showing.
 */

/** The two resolutions CIS publishes the seasonal forecast at. */
export type OverviewSource = "provinces" | "stations";

/** One province or station, reduced to what the overview counts. */
export type OverviewUnit = {
  key: string;
  /** As listed — a station by its own name, without its municipality. */
  name: string;
  /** In full, for a tooltip. */
  title: string;
  /** Null for a code the island table does not know; left out of the groups. */
  island: IslandGroup | null;
  /** Percent of normal, where 100 is normal. */
  pn: number | null;
  /** The forecast total, in mm. */
  mm: number | null;
  /** Mean temperature's departure from normal, in °C. Stations only. */
  anomaly: number | null;
  /** The likeliest outcome, when all three probabilities are published. Stations only. */
  tercile: Tercile | null;
  /** That outcome's probability, in percent: how sure the call is. */
  tercileProbability: number | null;
};

/**
 * Every province with a row for the month. A province the month has no row
 * for is not a unit of this month at all, so it is left out of the totals
 * rather than counted as a blank.
 */
export function provinceUnits(
  provinces: SeasonalProvinceIndex,
  stepId: string,
): OverviewUnit[] {
  const units: OverviewUnit[] = [];
  for (const province of provinces.values()) {
    const month = seasonalMonth(province, stepId);
    if (!month) continue;
    units.push({
      key: province.psgc,
      name: province.name,
      title: province.name,
      island: islandGroupOf(province.psgc),
      pn: finite(month.rainfallPn),
      mm: finite(month.rainfallMean),
      anomaly: null,
      tercile: null,
      tercileProbability: null,
    });
  }
  return units;
}

/**
 * Every station with a row for the month, placed in the island group the
 * station directory gives it (api/stations `Station.islandGroup`). The
 * forecast rows name no place of their own, so that is the one source.
 */
export function stationUnits(
  stations: SeasonalStationIndex,
  islandGroups: ReadonlyMap<number, IslandGroup | null>,
  stepId: string,
): OverviewUnit[] {
  const units: OverviewUnit[] = [];
  for (const station of stations.values()) {
    const month = seasonalStationMonth(station, stepId);
    if (!month) continue;
    const probabilities = tercileProbabilities(month);
    const likeliest = probabilities ? dominantTercile(probabilities) : null;
    units.push({
      key: String(station.stationId),
      name: stationShortName(station.name),
      title: station.name,
      island: islandGroups.get(station.stationId) ?? null,
      pn: finite(month.rainfallPn),
      mm: finite(month.rainfallMean),
      anomaly: finite(month.tmeanAnomaly),
      tercile: likeliest?.tercile ?? null,
      tercileProbability: likeliest?.probability ?? null,
    });
  }
  return units;
}

/** How many units fall in one percent-of-normal class. */
export type ClassCount = {
  label: string;
  color: string;
  count: number;
};

const PN_SCALE = RAINFALL_PERCENT_OF_NORMAL_SCALE;

/** A unit's percent-of-normal class name, or null when it has no reading. */
export function pnClassLabel(pn: number | null): string | null {
  if (pn === null) return null;
  const cls = PN_SCALE.classAt(pn);
  return cls.label ?? cls.range;
}

/** A unit's percent-of-normal class colour, or null when it has no reading. */
export const pnClassColor = (pn: number | null): string | null =>
  pn === null ? null : PN_SCALE.classAt(pn).color;

/**
 * The units per percent-of-normal class, in the scale's order — driest first,
 * as the legend reads. Every class is listed, empty ones at zero, so the
 * legend beside the donut keeps its rows as the months change. A unit with no
 * reading is in no class.
 */
export function pnDistribution(units: readonly OverviewUnit[]): ClassCount[] {
  const counts = PN_SCALE.classes.map((cls) => ({
    label: cls.label ?? cls.range,
    color: cls.color,
    count: 0,
  }));
  for (const unit of units) {
    if (unit.pn === null) continue;
    const index = PN_SCALE.classes.indexOf(PN_SCALE.classAt(unit.pn));
    if (index >= 0) counts[index].count += 1;
  }
  return counts;
}

/** One percent-of-normal class and the units in it. */
export type ClassMembers = ClassCount & {
  /** By name, as a reader looks one up. */
  units: OverviewUnit[];
};

/**
 * The distribution within each island group, north to south, with the units
 * behind every count, so a class can be listed as well as measured.
 */
export function islandDistributions(
  units: readonly OverviewUnit[],
): { group: IslandGroup; classes: ClassMembers[]; total: number }[] {
  return ISLAND_GROUPS.map((group) => {
    const members = units.filter((unit) => unit.island === group);
    const classes = pnDistribution(members).map((each, index) => ({
      ...each,
      units: members
        .filter(
          (unit) =>
            unit.pn !== null &&
            PN_SCALE.classes.indexOf(PN_SCALE.classAt(unit.pn)) === index,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return {
      group,
      classes,
      total: classes.reduce((sum, each) => sum + each.count, 0),
    };
  });
}

/**
 * How many stations have each outcome as their likeliest, above first, and
 * which: surest call first, so a shortened list keeps the ones the forecast
 * is most confident about. Equal odds fall back to the name.
 */
export function tercileCounts(units: readonly OverviewUnit[]): {
  tercile: Tercile;
  count: number;
  total: number;
  units: OverviewUnit[];
}[] {
  const decided = units.filter((unit) => unit.tercile !== null);
  return TERCILES.map((tercile) => {
    const members = decided
      .filter((unit) => unit.tercile === tercile)
      .sort(
        (a, b) =>
          (b.tercileProbability ?? 0) - (a.tercileProbability ?? 0) ||
          a.name.localeCompare(b.name),
      );
    return {
      tercile,
      count: members.length,
      total: decided.length,
      units: members,
    };
  });
}

/**
 * Units split by island group, north to south, each group keeping the order
 * it was given. Units the island table does not know come last, under null;
 * groups with nobody in them are left out.
 */
export function byIsland(
  units: readonly OverviewUnit[],
): { group: IslandGroup | null; units: OverviewUnit[] }[] {
  return [...ISLAND_GROUPS, null]
    .map((group) => ({
      group,
      units: units.filter((unit) => unit.island === group),
    }))
    .filter((each) => each.units.length > 0);
}

/** What the ranking can be ranked by. */
export type RankMetric = "pn" | "mm" | "anomaly";

export type RankMetricSpec = {
  /** The tab's text in the expanded panel. */
  label: string;
  /**
   * The same, for the collapsed panel's column, where three full labels
   * would not fit on one row: the unit alone, which the list's own values
   * repeat, so nothing is lost by it. The full label stays on as a tooltip.
   */
  shortLabel: string;
  /** The heads of the two lists: the top of the order, and the bottom. */
  high: string;
  low: string;
  value: (unit: OverviewUnit) => number | null;
  format: (value: number) => string;
  /** The dot and bar colour, and what it means, for one ranked unit. */
  mark: (unit: OverviewUnit) => {
    color: string | null;
    meaning: string | null;
  };
};

/**
 * The rainfall metrics mark a unit with its percent-of-normal class whichever
 * number is ranked, so a wet month in a normally wet province reads as near
 * normal beside its large total rather than as the extreme the total suggests.
 */
const pnMark = (unit: OverviewUnit) => ({
  color: pnClassColor(unit.pn),
  meaning: pnClassLabel(unit.pn),
});

export const RANK_METRICS: Record<RankMetric, RankMetricSpec> = {
  pn: {
    label: "Rainfall (%N)",
    shortLabel: "% normal",
    high: "Wettest",
    low: "Driest",
    value: (unit) => unit.pn,
    format: (value) => `${Math.round(value)}%`,
    mark: pnMark,
  },
  mm: {
    label: "Rainfall (mm)",
    shortLabel: "mm",
    high: "Wettest",
    low: "Driest",
    value: (unit) => unit.mm,
    format: (value) => `${Math.round(value)} mm`,
    mark: pnMark,
  },
  anomaly: {
    label: "Temp Anomaly (°C)",
    shortLabel: "°C anomaly",
    high: "Warmest",
    low: "Coolest",
    value: (unit) => unit.anomaly,
    // A true minus, so a negative anomaly lines up with a positive one. Two
    // decimals, the anomaly legend's own, so the figure and the class its dot
    // is painted in cannot disagree.
    format: (value) => {
      const text = Math.abs(value).toFixed(2);
      // Judged on the rounded figure: -0.004 is "0.00", not "−0.00".
      const sign = Number(text) === 0 ? "" : value < 0 ? "−" : "+";
      return `${sign}${text} °C`;
    },
    // The anomaly layer's own classes, so a station's dot here is the colour
    // of its pill on the map.
    mark: (unit) => {
      if (unit.anomaly === null) return { color: null, meaning: null };
      const cls = TEMPERATURE_ANOMALY_SCALE.classAt(unit.anomaly);
      return { color: cls.color, meaning: cls.label ?? cls.range };
    },
  },
};

/** The metrics each resolution publishes: temperature is per station only. */
export const METRICS_FOR: Record<OverviewSource, readonly RankMetric[]> = {
  provinces: ["pn", "mm"],
  stations: ["pn", "mm", "anomaly"],
};

export type RankedUnit = {
  unit: OverviewUnit;
  /** Place in the whole order, so the bottom list counts up to the last. */
  rank: number;
  value: number;
  /** Bar length as a share of the largest magnitude in the order, in percent. */
  share: number;
};

/**
 * The top and bottom of the order, up to five each.
 *
 * Never more than half the order apiece, so a small island group lists each
 * unit once rather than the same province as both wettest and driest. A unit
 * with no value for the metric is not ranked.
 */
export function ranking(
  units: readonly OverviewUnit[],
  metric: RankMetric,
  island: IslandGroup | "all",
): { high: RankedUnit[]; low: RankedUnit[] } {
  const spec = RANK_METRICS[metric];
  const valued = units.flatMap((unit) => {
    if (island !== "all" && unit.island !== island) return [];
    const value = spec.value(unit);
    return value === null ? [] : [{ unit, value }];
  });
  valued.sort((a, b) => b.value - a.value);

  const n = valued.length;
  const k = Math.min(5, Math.floor(n / 2));
  const largest = Math.max(0, ...valued.map(({ value }) => Math.abs(value)));
  const ranked = (
    entry: { unit: OverviewUnit; value: number },
    index: number,
  ) => ({
    ...entry,
    rank: index + 1,
    share:
      largest > 0 ? Math.max(4, (Math.abs(entry.value) / largest) * 100) : 4,
  });

  return {
    high: valued.slice(0, k).map((entry, index) => ranked(entry, index)),
    low: valued
      .slice(n - k)
      .map((entry, index) => ranked(entry, n - k + index))
      .reverse(),
  };
}
