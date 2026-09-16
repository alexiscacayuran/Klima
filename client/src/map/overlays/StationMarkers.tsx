import { useCallback, useMemo } from "react";
import { Layer, Marker, Source } from "@vis.gl/react-maplibre";
import { seasonalStationMonth } from "@/api/seasonal";
import { stationShortName } from "@/api/stations";
import { LAYER_IDS, SOURCE_IDS } from "@/map/config/constants";
import { symbologyModeFor } from "@/map/config/rasters";
import {
  formatSeasonalValue,
  seasonalReadingFor,
  seasonalStationValue,
} from "@/map/config/seasonalReadings";
import { useMapInstance } from "@/map/hooks/useMapInstance";
import { useSeasonalStations } from "@/map/hooks/useSeasonalStations";
import { useStationClusters } from "@/map/hooks/useStationClusters";
import { useStations } from "@/map/hooks/useStations";
import { useSelection } from "@/map/state/useSelection";
import { StationClusterPill, StationPill } from "./StationPill";

/**
 * The station layer: points where CIS observes, carrying what it forecasts.
 *
 * The other half of the seasonal issuance. `/seasonal` publishes per province
 * and the map paints that as a surface; `/seasonal?spatialRes=station` publishes
 * the same issuance at the points it was actually modelled for, with temperature
 * and tercile probabilities the province rows have no room for. Seasonal
 * temperature exists *only* here, which is why a layer with no polygons behind
 * it is a real product shape rather than a degenerate one.
 *
 * Two sources of truth, joined here rather than upstream, because they expire
 * differently: where a station is (useStations) is effectively permanent, and
 * what it forecasts (useSeasonalStations) is replaced every issuance.
 *
 * Mounted inside <Map> but outside DataLayers, like LocationPopup and for the
 * same reason — the pills are DOM elements over the canvas rather than style
 * layers, so they take no place in LAYER_ORDER. The clustered <Source> below is
 * a style object, but it paints nothing; see the note on LAYER_IDS.stationPoints
 * for why it carries a layer at all.
 */

/**
 * Cluster geometry, fixed for the life of the source.
 *
 * Constants rather than props, and that is not a style preference:
 * react-maplibre's <Source> reduces *any* changed prop on a geojson source to a
 * bare `setData`, so a changed clusterRadius is dropped silently — the worker
 * keeps re-clustering with the options it was constructed with. Anything that
 * needs to vary would have to remount the source.
 *
 * 56px is a little over three pill-widths, so pills separate at roughly the zoom
 * where they would stop overlapping. Clustering stops at 7 because the country
 * is about six zoom levels wide: past that there is room for the stations
 * themselves, which is the point.
 */
const STATION_CLUSTER_RADIUS = 56;
const STATION_CLUSTER_MAX_ZOOM = 7;

type StationFeatureProperties = {
  /** Printed value, or null where the station publishes none this month. */
  value: string | null;
  unit?: string;
  color?: string;
  name: string;
  fullName: string;
};

export function StationMarkers() {
  const { variable, date } = useSelection();
  const map = useMapInstance();

  const geometry = useStations("seasonal");
  const values = useSeasonalStations(true);
  const reading = seasonalReadingFor(variable);

  /**
   * The two halves joined, with the reading already resolved into the strings a
   * pill prints.
   *
   * Baked in rather than looked up at render time because the features make a
   * round trip through MapLibre's worker: what comes back from
   * querySourceFeatures is the tile's copy of these properties, so anything not
   * put here would have to be re-joined per marker on every camera move.
   *
   * Memoised, and that is load-bearing. react-maplibre's <Source> runs a deep
   * equality check over every prop *during render* to decide whether to call
   * setData — on an unmemoised collection that is a full recursive walk of every
   * station on every render of this component.
   */
  const collection = useMemo<GeoJSON.FeatureCollection>(() => {
    const stations = geometry.status === "ready" ? geometry.stations : [];
    const forecasts = values.status === "ready" ? values.stations : null;

    return {
      type: "FeatureCollection",
      features: stations.map((station) => {
        const forecast = forecasts?.get(station.id) ?? null;
        const month = forecast ? seasonalStationMonth(forecast, date) : null;
        const value =
          reading && month ? seasonalStationValue(reading, month) : null;
        // Coloured off the raw number and printed from it separately: the pill
        // has to carry the colour of what CIS published, not of the rounded
        // figure. Resolved through the mode the layer declares rather than off
        // the class, so a pill and the surface a reader compares it against are
        // the same table read the same way — see config/rasters
        // `symbologyModeFor` and config/colorScales `colorFor`.
        const color =
          reading && value !== null
            ? reading.scale.colorFor(value, symbologyModeFor(variable))
            : undefined;

        const properties: StationFeatureProperties = {
          value:
            reading && value !== null
              ? formatSeasonalValue(reading, value)
              : null,
          unit: reading?.unit,
          color,
          name: stationShortName(station.name),
          fullName: station.name,
        };

        return {
          type: "Feature" as const,
          // The id is not decoration. querySourceFeatures returns a loose point
          // with only its own properties — no cluster_id to key on — so without
          // this there is no way to dedupe the copies that arrive from adjacent
          // tiles' buffers.
          id: station.id,
          geometry: {
            type: "Point" as const,
            coordinates: [station.lng, station.lat],
          },
          properties,
        };
      }),
    };
    // No mode in the list: it is a property of the selected layer, and
    // `reading` already changes with that. The colour is baked into the feature
    // properties, so anything that could change it has to be here.
  }, [geometry, values, reading, date, variable]);

  const items = useStationClusters(geometry.status === "ready");

  /**
   * Zoom to where a cluster comes apart.
   *
   * Promise-based in maplibre 5, unlike the callback form older Mapbox examples
   * use. It is a worker round trip, so the camera can have moved by the time it
   * resolves — easing from the cluster's own position rather than from wherever
   * the map now is keeps that from throwing the view somewhere the user did not
   * ask for.
   */
  const expandCluster = useCallback(
    (clusterId: number, lng: number, lat: number) => {
      const source = map?.getMap().getSource(SOURCE_IDS.stations);
      if (!source || !("getClusterExpansionZoom" in source)) return;

      void (
        source as {
          getClusterExpansionZoom: (id: number) => Promise<number>;
        }
      )
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          map?.easeTo({ center: [lng, lat], zoom, duration: 500 });
        })
        .catch(() => {
          // A cluster id the source no longer knows — the data changed under the
          // click. Nothing to zoom to, and nothing worth saying about it.
        });
    },
    [map],
  );

  return (
    <>
      <Source
        id={SOURCE_IDS.stations}
        type="geojson"
        data={collection}
        cluster
        clusterRadius={STATION_CLUSTER_RADIUS}
        clusterMaxZoom={STATION_CLUSTER_MAX_ZOOM}
      >
        {/*
          Draws nothing, and must exist. MapLibre stops loading a source that no
          unhidden layer references, and querySourceFeatures on an unloaded
          source returns an empty array rather than an error — so without this
          the map is simply blank. `filter: false` keeps the layer unhidden while
          populating zero features; `visibility: 'none'` would count as hidden
          and defeat it. No minzoom or maxzoom, for the same reason.
        */}
        <Layer id={LAYER_IDS.stationPoints} type="circle" filter={false} />
      </Source>

      {items.map((item) =>
        item.kind === "cluster" ? (
          <Marker
            key={`c${item.clusterId}`}
            longitude={item.lng}
            latitude={item.lat}
            anchor="center"
          >
            <StationClusterPill
              count={item.count}
              onClick={() =>
                expandCluster(item.clusterId, item.lng, item.lat)
              }
            />
          </Marker>
        ) : (
          <Marker
            key={`s${item.id}`}
            longitude={item.lng}
            latitude={item.lat}
            anchor="center"
          >
            <StationPill {...pillProps(item.properties)} />
          </Marker>
        ),
      )}
    </>
  );
}

/**
 * MapLibre's property bag, read back as the pill's props.
 *
 * The one place the round trip through the worker is undone. Properties survive
 * tiling as plain JSON, so what went in as `undefined` comes back absent and a
 * `null` value stays null — the distinction the pill depends on, since a null
 * value is a station with no reading this month and prints an em dash, which is
 * a different fact from a station that is missing.
 */
function pillProps(properties: Record<string, unknown>) {
  const text = (key: string): string | undefined =>
    typeof properties[key] === "string" ? (properties[key] as string) : undefined;

  return {
    value: text("value") ?? null,
    unit: text("unit"),
    color: text("color"),
    name: text("name") ?? "",
    title: text("fullName"),
  };
}
