import type { LngLatBoundsLike } from 'maplibre-gl'
import type { Feature, Geometry, Position } from 'geojson'

/**
 * Bounds of any GeoJSON feature, for fitBounds() after a selection.
 *
 * maplibre-gl exposes LngLatBounds.extend(), but constructing one requires the
 * library instance; a plain reduce keeps this usable from non-React code and in
 * tests. Returns null for features with no coordinates.
 */
export function featureBounds(feature: Feature): LngLatBoundsLike | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // Coordinates nest to a different depth per geometry type (Point is
  // [x, y], MultiPolygon is [[[[x, y]]]]), so recurse until the numbers.
  const visitCoords = (coords: unknown): void => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords as Position
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      return
    }
    for (const child of coords) visitCoords(child)
  }

  // GeometryCollection can nest, so geometries recurse rather than being
  // unwrapped one level.
  const visitGeometry = (geometry: Geometry | null): void => {
    if (!geometry) return
    if (geometry.type === 'GeometryCollection') {
      for (const child of geometry.geometries) visitGeometry(child)
      return
    }
    visitCoords(geometry.coordinates)
  }

  visitGeometry(feature.geometry)

  if (minX === Infinity) return null
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}
