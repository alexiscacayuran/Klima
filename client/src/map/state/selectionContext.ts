import { createContext } from 'react'
import {
  DEFAULT_LAYER_ID,
  DEFAULT_PRODUCT_ID,
  DEFAULT_VARIABLE_ID,
  variableKey,
} from '@/map/config/products'
import type { AdminLocation } from '@/map/types/features'

/**
 * What the map is showing, and which place it is showing it for.
 *
 * Separate from MapSettingsContext, which is scoped to how the *style* is
 * drawn — basemap, layer visibility. This one is about content, and it exists
 * because these two facts are the only state that has to cross the <Map>
 * boundary in both directions:
 *
 * - `variable` is written by the product rail, which sits *outside* <Map>, and
 *   read by the boundary source *inside* it, because the selected product
 *   decides which administrative tiers are drawn.
 * - the hover and pin are written inside <Map> from tile features and read
 *   outside it by anything that fetches: the tiles are the app's only source of
 *   location identity, so `location` below is what every `location=` parameter
 *   is built from (see AdminLocation).
 *
 * Neither has a prop path between those two sides — the chrome is a sibling of
 * <Map>, not a child — which is the same reason MapSettingsContext exists.
 *
 * Deliberately *not* here: which product the accordion has expanded, and the
 * timeline month. Nothing outside the chrome reads them yet. They move in when
 * a layer consumes them, not before.
 */

/** The pointer's reading of the boundary tiers, as one atomic update. */
export type BoundaryHover = {
  /**
   * PSGC of the parent-tier unit under the pointer — the one carved open to
   * show its children. Survives spots those children do not cover, which is
   * where it and `location` come apart.
   */
  parent: string | null
  /**
   * The unit under the pointer *at the product's own resolution*: a province
   * for a province-level product, whatever the pointer is technically also
   * inside. Null on land the finer tier does not cover — an inland lake belongs
   * to a province but to no municipality — where a region would be the wrong
   * answer rather than a coarser one.
   */
  location: AdminLocation | null
}

export const NO_HOVER: BoundaryHover = { parent: null, location: null }

export type MapSelection = {
  /** Composite key of the layer the map paints; see `variableKey`. */
  variable: string | null
  setVariable: (key: string | null) => void

  /**
   * What the pointer is over — and NO_HOVER for as long as a selection is
   * pinned, because the pin stops the reporting rather than competing with it.
   * See interactions/useBoundaryFocus for why that is a state and not a paint
   * rule.
   */
  hover: BoundaryHover
  setHover: (hover: BoundaryHover) => void

  /**
   * The unit a click pinned, which survives the pointer leaving it.
   *
   * Hover alone cannot drive a fetch — it changes on every mousemove, and the
   * API is rate-limited per IP (docs/cis-api.md §1) — so a request keys on this
   * and falls back to the hover for the transient readout.
   */
  pinned: AdminLocation | null
  setPinned: (location: AdminLocation | null) => void

  /** The place the app is currently about: the pin, else what is under the pointer. */
  location: AdminLocation | null
}

/** The layer the map opens on, as one key. */
export const DEFAULT_VARIABLE_KEY = variableKey(
  DEFAULT_PRODUCT_ID,
  DEFAULT_VARIABLE_ID,
  DEFAULT_LAYER_ID,
)

/**
 * Defaults so a component rendered outside the provider degrades to a map that
 * paints the default layer and reports no location, rather than throwing.
 */
export const SelectionContext = createContext<MapSelection>({
  variable: DEFAULT_VARIABLE_KEY,
  setVariable: () => {},
  hover: NO_HOVER,
  setHover: () => {},
  pinned: null,
  setPinned: () => {},
  location: null,
})
