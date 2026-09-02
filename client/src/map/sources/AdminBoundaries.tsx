import { useEffect, useRef } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { VectorSourceSpecification } from 'maplibre-gl'
import { LAYER_IDS, SOURCE_IDS } from '@/map/config/constants'
import {
  BOUNDARIES_SOURCE_LAYER,
  BOUNDARIES_ZOOM,
  MARTIN_SOURCES,
  USE_MLT,
  tileUrl,
} from '@/map/config/martin'
import { useRawMap } from '@/map/hooks/useMapInstance'
import { useMapSettings } from '@/map/state/useMapSettings'

/**
 * maplibre-gl 5.24 supports MLT at runtime — its style spec declares
 * `encoding: {mvt, mlt}` with an `mvt` default — but the bundled .d.ts omits
 * `encoding` from VectorSourceSpecification, so the prop cannot be spelled in
 * TypeScript without this widening. Delete it, and the `as` below, once the
 * typings include it.
 */
type VectorSourceWithEncoding = VectorSourceSpecification & {
  encoding?: 'mvt' | 'mlt'
}

/**
 * Philippine administrative boundaries, served by Martin straight from PostGIS.
 *
 * One source serves all three tiers; `?level=` picks which. Because the property
 * schema is identical at every level (see AdminBoundaryProperties), the layers
 * below are written once and never change when the level does — only the tile
 * URL does, and react-maplibre turns that into a `setTiles()` call rather than
 * a source teardown.
 *
 * Level 3 is served empty below z8 by design; see LEVEL_3_MIN_ZOOM.
 */
export function AdminBoundaries() {
  const { adminLevel, showBoundaries } = useMapSettings()
  const map = useRawMap()
  const previousLevel = useRef(adminLevel)

  /**
   * Feature ids are `psgc` cast to integer, which is unique *within* a level but
   * not across them — 1300000000 is NCR at level 1 and again at level 2. Any
   * state set before the switch would therefore be re-applied to whatever
   * feature happens to share the id at the new level, so it has to go.
   *
   * Runs on level change only, not on mount: clearing state that was never set
   * is harmless but the guard keeps the intent legible.
   */
  useEffect(() => {
    if (!map) return
    if (previousLevel.current === adminLevel) return
    previousLevel.current = adminLevel

    map.removeFeatureState({
      source: SOURCE_IDS.boundaries,
      sourceLayer: BOUNDARIES_SOURCE_LAYER,
    })
  }, [map, adminLevel])

  const source: VectorSourceWithEncoding = {
    type: 'vector',
    tiles: [tileUrl(MARTIN_SOURCES.adminBoundaries, { level: adminLevel })],
    minzoom: BOUNDARIES_ZOOM.minzoom,
    maxzoom: BOUNDARIES_ZOOM.maxzoom,
    attribution: 'Philippine Statistics Authority',
    ...(USE_MLT ? { encoding: 'mlt' as const } : {}),
  }

  return (
    <Source id={SOURCE_IDS.boundaries} {...source}>
      {/*
        Hit target, and the surface a choropleth will eventually paint.
        Kept at 0.01 rather than 0: an all-but-invisible fill is still indexed
        for queryRenderedFeatures, and a 1px stroke is far too small a click
        target to rely on instead. `visibility` is what actually hides it, since
        a hidden layer *is* excluded from queries — which is the intent when the
        user switches boundaries off.
      */}
      <Layer
        id={LAYER_IDS.boundariesFill}
        type="fill"
        source-layer={BOUNDARIES_SOURCE_LAYER}
        layout={{ visibility: showBoundaries ? 'visible' : 'none' }}
        paint={{ 'fill-color': '#ffffff', 'fill-opacity': 0.01 }}
      />
      <Layer
        id={LAYER_IDS.boundariesLine}
        type="line"
        source-layer={BOUNDARIES_SOURCE_LAYER}
        layout={{
          visibility: showBoundaries ? 'visible' : 'none',
          'line-join': 'round',
        }}
        paint={{
          'line-color': '#94a3b8',
          'line-opacity': 0.55,
          // Thin when the whole country is in frame, heavier as you zoom in —
          // a constant width reads as noise at z5 and as hairline at z12.
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 10, 1, 14, 1.6],
        }}
      />
    </Source>
  )
}
