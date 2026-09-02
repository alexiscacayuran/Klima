/**
 * The Martin tile server contract.
 *
 * Martin, PostGIS and the nginx that fronts them belong to the CIS stack, not
 * to this repo — Klima is purely a consumer. See docs/vector-tiles.md for the
 * server side; everything here is the client half of that contract.
 *
 * Every URL the map fetches from Martin is built by a function in this file, so
 * repointing the app at staging or production is one env var rather than a
 * search for string concatenation.
 */

/**
 * Where Martin is reachable *from the browser*.
 *
 * Note "from the browser", not from the dev-server container: MapLibre issues
 * tile requests from the page, so this resolves against the user's machine.
 * That is why the dev default is a published host port rather than the
 * `martin-dev` container hostname, which only resolves inside the CIS network.
 *
 * Martin echoes the request Origin in `access-control-allow-origin`, so the
 * cross-origin dev setup needs no proxy. In production the app is served behind
 * an nginx that proxies `/tiles/`, making it same-origin — hence the split
 * default below.
 *
 * Override with VITE_TILES_URL to point at a deployed stack.
 */
const CONFIGURED_TILES_URL =
  import.meta.env.VITE_TILES_URL ??
  (import.meta.env.DEV ? 'http://localhost:3001' : '/tiles')

/**
 * Absolute, always — a same-origin path like "/tiles" is resolved against the
 * page origin here rather than being passed through as-is.
 *
 * This is not tidiness. MapLibre validates `style.sprite` and rejects a relative
 * URL outright ("must be absolute"), and because that check happens during
 * style load it aborts the whole style — no basemap, no tiles, not just no
 * sprites. Development never hits it, since the dev default is already an
 * origin; only a production build with the "/tiles" default does.
 *
 * `location.origin` is read once at module load. The fallback keeps this module
 * importable outside a browser (unit tests, any future prerender step), where
 * the value is never actually fetched.
 */
export const TILES_BASE_URL = (
  typeof window === 'undefined'
    ? CONFIGURED_TILES_URL
    : new URL(CONFIGURED_TILES_URL, window.location.origin).href
).replace(/\/$/, '')

/**
 * Ids of the sources Martin publishes, as they appear in `/catalog`.
 *
 * Distinct from the *client-side* source id the style uses — see SOURCE_IDS in
 * ./constants. The two are deliberately allowed to differ: the server names the
 * dataset, the style names the thing layers bind to.
 */
export const MARTIN_SOURCES = {
  adminBoundaries: 'admin_boundaries',
} as const

/**
 * The layer name *inside* the vector tile, set server-side by `ST_AsMVT`.
 *
 * Every <Layer> reading this source must pass it as `source-layer`. Getting it
 * wrong renders nothing and logs nothing — there is no error for "no such
 * source-layer", the layer is simply empty, which is why it is a constant here
 * rather than a literal at each layer.
 */
export const BOUNDARIES_SOURCE_LAYER = 'boundaries'

/** Zoom range Martin advertises for admin_boundaries in its TileJSON. */
export const BOUNDARIES_ZOOM = { minzoom: 0, maxzoom: 14 } as const

/** Martin's own catalog endpoint — the source of truth for fonts and sprites. */
export const catalogUrl = () => `${TILES_BASE_URL}/catalog`

/**
 * Tile template for a published source.
 *
 * Returns a template with `{z}/{x}/{y}` left *unexpanded* — MapLibre substitutes
 * those itself, so the braces must survive into the style.
 */
export function tileUrl(
  source: string,
  params?: Record<string, string | number>,
): string {
  const base = `${TILES_BASE_URL}/${source}/{z}/{x}/{y}`
  if (!params) return base
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  )
  return `${base}?${query}`
}

/**
 * Glyph template for `style.glyphs`.
 *
 * `{fontstack}` and `{range}` are MapLibre placeholders and must not be encoded,
 * which rules out URLSearchParams here.
 */
export const glyphsUrl = () => `${TILES_BASE_URL}/font/{fontstack}/{range}`

/**
 * Sprite base for `style.sprite`. MapLibre appends `.json`/`.png` and the
 * `@2x` suffix itself, so this is deliberately extension-less.
 *
 * `sdf: true` selects Martin's SDF rendering of the same sheet, which is what
 * makes `icon-color` settable at runtime — required for any icon that has to be
 * recoloured by data (station symbols tinted by temperature, say). SDF sprites
 * cannot carry their own colours, so it is a real trade, not a free upgrade.
 */
export const spriteUrl = (id = 'markers', { sdf = false } = {}) =>
  `${TILES_BASE_URL}/${sdf ? 'sdf_sprite' : 'sprite'}/${id}`

/**
 * Whether to request MLT instead of MVT.
 *
 * MLT roughly halves tile payload and Martin transcodes on demand
 * (`convert_to_mlt: auto`), keyed off the Accept header MapLibre sends when a
 * source opts in. Left OFF because maplibre-gl 5.24 ships MLT in its runtime
 * style spec — `encoding: {mvt, mlt}` — but omits `encoding` from
 * VectorSourceSpecification in its bundled .d.ts, so enabling it costs a cast
 * (see sources/AdminBoundaries.tsx). Flip this and drop the cast once the
 * typings catch up.
 */
export const USE_MLT = false
