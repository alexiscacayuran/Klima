import { fetchDroughtSeries, mergeDroughtMonths } from '@/api/drought'
import type { DroughtMonth, DroughtSeries, DroughtStatus } from '@/api/drought'
import { fetchAllIslandGroups } from '@/api/normalize'
import { choroplethVariantFor, categoryOf } from '@/map/config/choropleths'
import type { ChoroplethVariant } from '@/map/config/choropleths'
import type { Category } from '@/map/config/colorScales'
import { hasOverlay, spatialLevelForVariable } from '@/map/config/products'
import { useSelection } from '@/map/state/useSelection'
import type { AdminLevel } from '@/map/types/features'
import { createKeyedResource } from './keyedResource'
import type { ResourceState } from './keyedResource'

/** A series' published months, keyed by `YYYY-MM` — the timeline's step id. */
export type DroughtMonths = ReadonlyMap<string, DroughtMonth>

/**
 * One series of the drought issuance, nationally, fetched once per page.
 *
 * Three requests per series — one per island group, which drought alone takes
 * as a location (see api/normalize `fetchAllIslandGroups`) — and every month the
 * series covers in them, so scrubbing the timeline and playing it back cost
 * nothing further. Keyed by series, so the assessment and the outlook are two
 * separate fetches made only when their layer is first selected — or when a
 * place is opened in the detail panel, which reads both (see useDroughtDetail).
 *
 * A series with no months at all resolves to `none`, the same reading as the
 * 404 it would have been for one location.
 */
export const useDroughtMonths = createKeyedResource((series: DroughtSeries) =>
  fetchAllIslandGroups((islandGroup) => fetchDroughtSeries(series, islandGroup))
    .then(mergeDroughtMonths)
    .then((months): DroughtMonths | null =>
      months.length
        ? new Map(months.map((month) => [month.date, month]))
        : null,
    ),
)

/** The selected layer's choropleth, and the national issuance it is filled from. */
export type Choropleth = {
  variant: ChoroplethVariant
  /** The tier the fills are painted on: the product's own resolution. */
  level: AdminLevel
  /** The shared fetch, as it stands. Never `idle` — a choropleth always asks. */
  months: ResourceState<DroughtMonths>
}

/**
 * The choropleth the selected layer paints, or null if it paints none.
 *
 * A hook rather than a line in the overlay for the reason useRasterVariant is
 * one: the overlay, the legend, the timeline's thumbnails and the popup all
 * have to agree on it, and they sit on both sides of <Map>. The fetch is shared
 * between them by the keyed store, so four readers are one request per series.
 *
 * Two questions, as for the raster: whether CIS publishes classes for this
 * layer (the variant), and whether the layer is meant to draw them (its
 * `choropleth` overlay).
 */
export function useChoropleth(): Choropleth | null {
  const { variable } = useSelection()
  const variant = hasOverlay(variable, 'choropleth')
    ? choroplethVariantFor(variable)
    : null
  // Above the early return, as hooks have to be; a null key fetches nothing.
  const months = useDroughtMonths(variant?.series ?? null)

  if (!variant) return null
  return { variant, level: spatialLevelForVariable(variable), months }
}

/**
 * One published month, or null — while the fetch is out, when it failed, or for
 * a step the series holds no issuance for.
 */
export function choroplethMonth(
  choropleth: Choropleth,
  stepId: string | null,
): DroughtMonth | null {
  if (choropleth.months.status !== 'ready' || !stepId) return null
  return choropleth.months.data.get(stepId) ?? null
}

/**
 * The class a unit is in for a step, or null where the month says nothing
 * about it — which is not the same thing as "Not affected".
 */
export function choroplethCategory(
  choropleth: Choropleth,
  psgc: string,
  stepId: string | null,
): Category<DroughtStatus> | null {
  const status = choroplethMonth(choropleth, stepId)?.statuses.get(psgc)
  return status ? categoryOf(choropleth.variant, status) : null
}
