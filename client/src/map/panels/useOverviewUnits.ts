import { useMemo } from "react";
import { useSeasonalProvinces } from "@/map/hooks/useSeasonalProvinces";
import { useSeasonalStations } from "@/map/hooks/useSeasonalStations";
import { useStations } from "@/map/hooks/useStations";
import { provinceUnits, stationUnits } from "./overviewSummary";
import type { OverviewSource, OverviewUnit } from "./overviewSummary";

export type OverviewUnitsState = {
  /** Each resolution's units for the month; null until its fetches answer. */
  units: Record<OverviewSource, OverviewUnit[] | null>;
  /** Whether each resolution's fetches failed. */
  failed: Record<OverviewSource, boolean>;
  /** When the issuance was published, once either resolution names it. */
  issuedAt: string | undefined;
  /** Either resolution has answered, whether or not it had rows. */
  answered: boolean;
};

/**
 * One month of the seasonal issuance as overview units, at both resolutions.
 *
 * Counted from the national fan-outs the map already draws from
 * (useSeasonalProvinces, useSeasonalStations), so it costs no request of its
 * own however many things read it — the overview panel and the dock's button
 * for it both do (see OverviewLauncher).
 */
export function useOverviewUnits(stepId: string | null): OverviewUnitsState {
  const provinces = useSeasonalProvinces(true);
  const stations = useSeasonalStations(true);
  // Where each station's island group comes from: the forecast rows name no
  // place. The same shared request the station markers make.
  const directory = useStations("seasonal");

  const provinceList = useMemo(
    () =>
      provinces.status === "ready" && stepId
        ? provinceUnits(provinces.provinces, stepId)
        : null,
    [provinces, stepId],
  );
  const stationList = useMemo(() => {
    if (stations.status !== "ready" || directory.status !== "ready" || !stepId)
      return null;
    const islandGroups = new Map(
      directory.stations.map((station) => [station.id, station.islandGroup]),
    );
    return stationUnits(stations.stations, islandGroups, stepId);
  }, [stations, directory, stepId]);

  // Every row of an issuance carries the same `issuedAt`, so whichever
  // resolution lands first can name it for both.
  const issuedAt =
    (provinces.status === "ready"
      ? provinces.provinces.values().next().value?.issuedAt
      : undefined) ??
    (stations.status === "ready"
      ? stations.stations.values().next().value?.issuedAt
      : undefined);

  return {
    units: { provinces: provinceList, stations: stationList },
    failed: {
      provinces: provinces.status === "error",
      stations: stations.status === "error" || directory.status === "error",
    },
    issuedAt,
    answered: provinces.status === "ready" || stations.status === "ready",
  };
}
