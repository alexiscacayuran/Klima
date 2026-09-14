import { createContext } from 'react'
import {
  DEFAULT_LAYER_ID,
  DEFAULT_PRODUCT_ID,
  DEFAULT_VARIABLE_ID,
  variableKey,
} from '@/map/config/products'
import type { AdminLocation } from '@/map/types/features'
import type { LngLat } from '@/map/utils/coordinates'

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
 * - `date` is written by the timeline, which is chrome, and read by the
 *   selection popup, which is a child of <Map>. It moved in here the moment
 *   something on the map read it, which is the rule this file has always
 *   applied rather than an exception to it.
 *
 * None has a prop path between those two sides — the chrome is a sibling of
 * <Map>, not a child — which is the same reason MapSettingsContext exists.
 *
 * Deliberately *not* here: which product the accordion has expanded. Nothing
 * outside the chrome reads it yet. It moves in when something does, not before.
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

/**
 * A pinned place, plus the point that pinned it.
 *
 * The coordinate is the click's own, not the unit's centroid, because it is the
 * only part of the selection the boundaries cannot say afterwards: the polygon
 * is on the map already, and where inside it the user pointed is not. It is
 * what the marker is planted at and what the popup reports.
 *
 * Widening AdminLocation rather than wrapping it keeps every existing reader —
 * `enclosingParent(pinned)`, `pinned.psgc`, the `location` field below — working
 * unchanged, since a pin still *is* a location.
 */
export type PinnedLocation = AdminLocation & {
  lngLat: LngLat
}

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
  pinned: PinnedLocation | null
  setPinned: (location: PinnedLocation | null) => void

  /** The place the app is currently about: the pin, else what is under the pointer. */
  location: AdminLocation | null

  /**
   * The step the timeline is scrubbed to, as the id the selected product's own
   * `date` parameter takes: `YYYY-MM` for the monthly products (seasonal,
   * drought), `YYYY-MM-DD` for the daily ones (five-day, daily monitoring).
   * See docs/cis-api.md §6.
   *
   * Kept as that id rather than as a Date, so it stays the value a request is
   * built from without a conversion that would have to know the granularity;
   * spelling it for a reader is formatStepId's job, and it reads the
   * granularity back off the id.
   *
   * Null until the product catalogue resolves, and again whenever the selected
   * product publishes no dates — there is no honest default before then. A
   * window guessed from today's date would look exactly like a real one while
   * pointing at months CIS has published nothing for. useTimeline owns filling
   * it in and keeping it inside the window.
   */
  date: string | null
  setDate: (stepId: string | null) => void
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
  date: null,
  setDate: () => {},
})
