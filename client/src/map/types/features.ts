import type { MapGeoJSONFeature } from 'maplibre-gl'

/**
 * Feature property shapes for the sources we query.
 *
 * MapLibre types `feature.properties` as a loose record because it comes off
 * the wire untyped. Declare each source's shape here and pair it with
 * `TypedFeature`, so the cast at the query boundary is written once and
 * reviewed in one place rather than repeated inline at each call site.
 *
 * e.g.
 *   type StationProperties = { id: string; tempC: number }
 *   type StationFeature = TypedFeature<StationProperties>
 */
export type TypedFeature<P> = MapGeoJSONFeature & { properties: P }
