import { useCallback } from 'react'
import { seasonalMonth } from '@/api/seasonal'
import {
  cisProductForVariable,
  hasOverlay,
  spatialLevelForVariable,
} from '@/map/config/products'
import type { RasterVariant } from '@/map/config/rasters'
import { symbologyModeFor } from '@/map/config/rasters'
import {
  seasonalReadingFor,
  seasonalValue,
} from '@/map/config/seasonalReadings'
import { useIssuance } from '@/map/hooks/useIssuance'
import { useRasterVariant } from '@/map/hooks/useRasterVariant'
import { useSeasonalProvinces } from '@/map/hooks/useSeasonalProvinces'
import { useSelection } from '@/map/state/useSelection'
import type { AdminLevel } from '@/map/types/features'

/**
 * What the timeline's snapshots of the selected layer are drawn from.
 *
 * - **`raster`** — the published surface, one image per step. `issuedAt` is
 *   null until the issuance resolves, and stays null if it resolves to nothing;
 *   `pending` is what tells the two apart, so a card shimmers for the one and
 *   settles on a dash for the other.
 * - **`choropleth`** — the layer's per-unit values, filled into the units at
 *   the product's own resolution. For a layer that publishes a field per unit
 *   but no surface behind it, which is the drought product's shape; no layer on
 *   the rail has it today, and a surface always wins where there is one, so the
 *   thumbnail shows what the map shows.
 *
 * Null for a layer with neither — station-only layers like seasonal
 * temperature, or a product CIS has not published. Their map is points on a
 * blank country, and a strip of identical blank silhouettes would preview
 * nothing, so the timeline offers no strip for them at all.
 */
export type SnapshotSource =
  | {
      kind: 'raster'
      variant: RasterVariant
      issuedAt: string | null
      pending: boolean
    }
  | {
      kind: 'choropleth'
      level: AdminLevel
      /** A unit's fill in a step, or null where it has no value. */
      colorOf: (psgc: string, stepId: string) => string | null
      /** False until the values have landed. */
      ready: boolean
    }

export function useSnapshotSource(): SnapshotSource | null {
  const { variable } = useSelection()

  // The same hook RasterOverlay and the legend resolve the surface through, so
  // a thumbnail cannot preview a surface the map would not draw.
  const variant = useRasterVariant()
  const issuance = useIssuance(variant?.product)

  const reading = seasonalReadingFor(variable)
  const choropleth =
    !variant &&
    cisProductForVariable(variable) === 'seasonal' &&
    hasOverlay(variable, 'boundaries') &&
    reading?.field !== undefined
  // The same national fan-out the labels print from, shared and fetched once.
  const provinces = useSeasonalProvinces(choropleth)
  const index = provinces.status === 'ready' ? provinces.provinces : null
  const mode = symbologyModeFor(variable)

  const colorOf = useCallback(
    (psgc: string, stepId: string) => {
      const province = index?.get(psgc)
      const month = province ? seasonalMonth(province, stepId) : null
      const value = month && reading ? seasonalValue(reading, month) : null
      return value === null || !reading
        ? null
        : reading.scale.colorFor(value, mode)
    },
    [index, reading, mode],
  )

  if (variant) {
    return {
      kind: 'raster',
      variant,
      issuedAt: issuance.status === 'ready' ? issuance.issuedAt : null,
      pending: issuance.status === 'loading' || issuance.status === 'idle',
    }
  }
  if (choropleth) {
    return {
      kind: 'choropleth',
      level: spatialLevelForVariable(variable),
      colorOf,
      ready: index !== null,
    }
  }
  return null
}
