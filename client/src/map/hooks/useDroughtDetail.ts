import { useMemo } from 'react'
import type { DroughtSeries } from '@/api/drought'
import type { DroughtPlaceMonth } from '@/map/config/detailRows'
import { cisProductForVariable } from '@/map/config/products'
import { DROUGHT_TIMELINES, timelineFor } from '@/map/config/timeline'
import { useSelection } from '@/map/state/useSelection'
import { useDroughtMonths } from './useChoropleth'
import { useProducts } from './useProducts'

/** One of a place's two drought tables: a series, over its layer's window. */
export type DroughtPlaceTable = {
  series: DroughtSeries
  /** Earliest first — the months the series' layer scrubs, published or not. */
  months: readonly DroughtPlaceMonth[]
  /**
   * The month the layer opens on: the current assessment, the first outlook
   * month. Null while the window is empty.
   */
  anchorDate: string | null
}

export type DroughtDetailState =
  /** Nothing to read: no place, or a selected layer that is not drought. */
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready'
      /** Assessment, then outlook — the order the months run in. */
      tables: readonly DroughtPlaceTable[]
      /** The newest issuance either series carries. */
      issuedAt: string | null
    }
  /**
   * Neither series says anything about the place in any month of its window —
   * a unit drought does not cover (docs/cis-api.md §4), not an error.
   */
  | { status: 'none' }
  | { status: 'error' }

const IDLE = { status: 'idle' } as const
const LOADING = { status: 'loading' } as const
const NONE = { status: 'none' } as const
const ERROR = { status: 'error' } as const

const SERIES: readonly DroughtSeries[] = ['assessment', 'outlook']

/**
 * A place's drought status across the whole issuance, for the detail panel.
 *
 * Read out of the national fetches the map is painted from rather than asked of
 * `GET /drought` for the one province: the table then cannot name a different
 * status from the fill and the popup beside it, it costs no request per pin,
 * and the assessment keeps its history — the per-province series carries the
 * newest issuance only. Opening a place fetches the series the map is not
 * showing, once, and the map has it if the reader switches layer.
 *
 * The columns are each layer's timeline window rather than the months the
 * response holds, so the table and the scrubber list the same months, and the
 * column lit for the timeline's step is always there to light.
 */
export function useDroughtDetail(psgc: string | null): DroughtDetailState {
  const { variable } = useSelection()
  const active = psgc !== null && cisProductForVariable(variable) === 'drought'
  // Both above any return, as hooks have to be; a null key fetches nothing.
  const assessment = useDroughtMonths(active ? 'assessment' : null)
  const outlook = useDroughtMonths(active ? 'outlook' : null)
  const products = useProducts()

  // Memoised so the months keep their identity across renders: the table
  // scrolls its lit column into view whenever they change.
  return useMemo((): DroughtDetailState => {
    if (!active || psgc === null) return IDLE
    const fetched = { assessment, outlook }
    const states = [assessment, outlook]
    if (
      products.status === 'error' ||
      states.some((state) => state.status === 'error')
    ) {
      return ERROR
    }
    if (
      products.status === 'loading' ||
      states.some((state) => state.status === 'loading')
    ) {
      return LOADING
    }

    let issuedAt: string | null = null
    const tables = SERIES.map((series): DroughtPlaceTable => {
      const state = fetched[series]
      // `none` is a series with no months at all: every column a dash.
      const published = state.status === 'ready' ? state.data : undefined
      for (const month of published?.values() ?? []) {
        if (!issuedAt || month.issuedAt > issuedAt) issuedAt = month.issuedAt
      }
      const { steps, initialStepId } = timelineFor(
        'drought',
        DROUGHT_TIMELINES[series],
        products.catalogue,
      )
      return {
        series,
        anchorDate: initialStepId,
        months: steps.map((step) => {
          const statuses = published?.get(step.id)?.statuses ?? null
          return {
            id: step.id,
            date: step.id,
            status: statuses?.get(psgc) ?? null,
            statuses,
          }
        }),
      }
    })

    const covered = tables.some((table) =>
      table.months.some((month) => month.status !== null),
    )
    return covered ? { status: 'ready', tables, issuedAt } : NONE
  }, [active, psgc, assessment, outlook, products])
}
