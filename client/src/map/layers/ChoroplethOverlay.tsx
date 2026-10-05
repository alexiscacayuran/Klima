import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'

import { LAYER_IDS, SOURCE_IDS } from '@/map/config/constants'
import { BOUNDARIES_SOURCE_LAYER, boundarySource } from '@/map/config/martin'
import { DEFAULT_SPATIAL_LEVEL } from '@/map/config/products'
import type { Category } from '@/map/config/colorScales'
import { paintColor } from '@/map/config/choropleths'
import { choroplethMonth, useChoropleth } from '@/map/hooks/useChoropleth'
import { useMapSettings } from '@/map/state/useMapSettings'
import { useSelection } from '@/map/state/useSelection'

/**
 * Each unit filled with its published class, for the scrubbed month.
 *
 * The raster's counterpart for a product published per unit — drought, a status
 * per province and no field between them — and deliberately in its place:
 * directly under the land, so the basemap reads over the classes exactly as it
 * reads over the surface. The land tier's roads, rivers and landuse tint it,
 * the sea mask takes it back off every water polygon — Laguna de Bay, Lake
 * Lanao and Taal included — and the boundary fills and strokes, the hover and
 * the pin all sit above it. Painted at the raster's opacity, it takes the same
 * share of the basemap.
 *
 * Unlike the raster it is a plain MapLibre fill — the classes are already
 * colours, so there is no value channel for a palette to decode — but a fill
 * takes a `beforeId` like any other layer, and that is all the slot asks for.
 *
 * ## Why its slot is named rather than mounted into
 *
 * `beforeId` is the land layer, which composeGround builds into the style
 * itself (utils/basemapStyle), so it exists before any component mounts and
 * this one's place in DataLayers does not matter. Mount order alone would not
 * hold: the layer is added the first time a choropleth is selected, long after
 * the boundary layers, and would otherwise land at the top of the style.
 *
 * ## No cross-fade
 *
 * The raster blends between months because it blends *values*. There is no
 * value here to blend — a province is in one class or the next, never between —
 * and MapLibre does not transition a data-driven colour anyway, so a month
 * change repaints the classes at once.
 */
export function ChoroplethOverlay() {
  const { date } = useSelection()
  const { visibleLayers } = useMapSettings()
  const choropleth = useChoropleth()
  const month = choropleth ? choroplethMonth(choropleth, date) : null

  // Keyed by the variant too, not the month alone: a month object belongs to
  // one series, but the classes it is painted in are the variant's.
  const variant = choropleth?.variant ?? null
  const fill = useMemo(
    () => (variant && month ? fillColor(month.statuses, variant.classes) : null),
    [variant, month],
  )

  // Nothing to paint — no choropleth selected, the fetch still out or failed, a
  // step with no issuance, or the layer switched off — hides the layer rather
  // than unmounting it, so the source and its parsed tiles outlive a scrub
  // through an empty month. A hidden layer is what stops MapLibre loading the
  // source's tiles at all while no choropleth is selected.
  const visible = fill !== null && (visibleLayers[LAYER_IDS.choropleth] ?? true)

  return (
    <Source
      id={SOURCE_IDS.choropleth}
      {...boundarySource(choropleth?.level ?? DEFAULT_SPATIAL_LEVEL)}
    >
      <Layer
        id={LAYER_IDS.choropleth}
        type="fill"
        source-layer={BOUNDARIES_SOURCE_LAYER}
        beforeId={LAYER_IDS.land}
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'fill-color': fill ?? TRANSPARENT,
          'fill-opacity': variant?.opacity ?? 0,
        }}
      />
    </Source>
  )
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * One month's classes as a `fill-color` expression: every PSGC matched to its
 * class, and everything the month says nothing about left unpainted.
 *
 * One branch per class rather than per unit — `match` takes a list of labels —
 * so the expression is four arms long whatever the country's size. A class no
 * unit is in is left out, since `match` rejects an empty label list.
 *
 * A class's own `opacity` is folded into its colour's alpha, which MapLibre
 * multiplies with the layer's `fill-opacity`: that is what lets "Not affected"
 * recede without a second layer or a second expression.
 */
function fillColor(
  statuses: ReadonlyMap<string, string>,
  classes: readonly Category[],
): ExpressionSpecification | null {
  const members = new Map<string, string[]>()
  for (const [psgc, status] of statuses) {
    const list = members.get(status)
    if (list) list.push(psgc)
    else members.set(status, [psgc])
  }

  const arms: (string | string[])[] = []
  for (const category of classes) {
    const psgcs = members.get(category.label)
    if (!psgcs?.length) continue
    arms.push(psgcs, paintColor(category))
  }
  if (arms.length === 0) return null

  return [
    'match',
    ['get', 'psgc'],
    ...arms,
    TRANSPARENT,
  ] as unknown as ExpressionSpecification
}
