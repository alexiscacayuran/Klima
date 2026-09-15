import chroma from 'chroma-js'
import type { CisProductName } from '@/api/products'
import type { ColorScale } from './colorScales'
import {
  RAINFALL_FORECAST_SCALE,
  RAINFALL_PERCENT_OF_NORMAL_SCALE,
} from './colorScales'
import { parseVariableKey } from './products'

/**
 * The raster contract: where the published surfaces live and which one a
 * selected layer is about.
 *
 * The third leg of the CIS contract, after Martin's geometry and the API's
 * numbers — see docs/raster-layers.md. These are the interpolated fields the
 * forecast was gridded on before it was averaged into provinces, so the surface
 * and the choropleth are two readings of one issuance and must never disagree
 * on screen.
 *
 * MinIO belongs to the CIS stack, not to this repo. Everything here is the
 * client half, and every URL the map fetches from it is built by a function in
 * this file, for the same reason config/martin.ts gives.
 *
 * Not tiled: one image covers the whole country per forecast month. There is no
 * {z}/{x}/{y} and nothing to cache per tile, which is why this file builds whole
 * object keys rather than templates.
 */

/**
 * Where MinIO is reachable *from the browser*.
 *
 * The origin only — **no bucket**. docs/raster-layers.md §2 writes the bucket
 * into this value, and that is the one thing here that deviates from it:
 * `seasonal-forecast` is one product's bucket, and seasonal is not the only
 * product CIS publishes rasters for. The bucket is a property of the product,
 * so it lives on RasterSource below and a second product costs a config entry
 * rather than a second environment variable.
 *
 * MinIO echoes the request Origin and exposes the `x-amz-*` headers §5 depends
 * on, so development talks to it directly with no proxy — the opposite of the
 * API, and the same posture as Martin. In production the app is served behind an
 * nginx that proxies `/rasters/`, hence the split default.
 *
 * Not absolutized, unlike TILES_BASE_URL: that exists because MapLibre rejects a
 * relative `style.sprite` and aborts the whole style, and nothing here passes
 * through MapLibre — the loader sets `img.src`, which resolves a relative URL
 * against the page itself. Same reasoning as api/client.ts.
 */
const CONFIGURED_RASTER_URL =
  import.meta.env.VITE_RASTER_URL ??
  (import.meta.env.DEV ? 'http://localhost:9000' : '/rasters')

export const RASTER_BASE_URL = CONFIGURED_RASTER_URL.replace(/\/$/, '')

/** The two encodings CIS publishes per surface. */
export type RasterExt = 'webp' | 'tif'

/** What a key builder is told about the image it is naming. */
export type RasterKeyParams = {
  /** The object-name prefix, e.g. `sf.rainfallpn`. */
  prefix: string
  /** The issuance, ISO with an explicit offset: `2026-08-26T00:00:00+08:00`. */
  issuedAt: string
  /** The step being rendered — a TimelineStep id, `YYYY-MM` for a monthly product. */
  step: string
  ext: RasterExt
}

/**
 * How one product family names its raster objects.
 *
 * A product, not a variable: an issuance publishes every one of its variants
 * under one layout, and the variant only changes the `{prefix}` segment.
 */
export type RasterSource = {
  /** The MinIO bucket. See the note on RASTER_BASE_URL for why it lives here. */
  bucket: string
  /** The bucket-relative object key. */
  key: (params: RasterKeyParams) => string
}

/**
 * Seasonal: `processed/raster/{year}/{prefix}.{YYYYMMDD}.{YYYYMM}.webp`.
 *
 * `{year}` is the year of the **issuance**, not of the forecast month — the
 * January and February 2027 images live under `2026/`, because the importer
 * takes the folder from the parsed issuance date. Deriving it from the month
 * being rendered gives a 404 every December.
 *
 * Sliced, never `new Date(issuedAt).getFullYear()`: the timestamp carries an
 * explicit +08:00, so a local Date in any western timezone lands on the previous
 * day — and on 31 December, the previous *year*, which is the folder name.
 */
const SEASONAL_RASTERS: RasterSource = {
  bucket: 'seasonal-forecast',
  key: ({ prefix, issuedAt, step, ext }) => {
    const [year, month, day] = issuedAt.slice(0, 10).split('-')
    const forecastMonth = step.slice(0, 7).replace('-', '')
    return `processed/raster/${year}/${prefix}.${year}${month}${day}.${forecastMonth}.${ext}`
  },
}

/**
 * The products that publish rasters, keyed by the same CIS name
 * PRODUCT_TIMELINES uses. Partial because most of them do not, yet.
 */
export const RASTER_SOURCES: Partial<Record<CisProductName, RasterSource>> = {
  seasonal: SEASONAL_RASTERS,
}

/** The surface a selected layer paints. */
export type RasterVariant = {
  /** Which product's key layout names it. */
  product: CisProductName
  /** The object-name prefix within that product. */
  prefix: string
  /**
   * The layer's published symbology — the *same* table the choropleth and the
   * selection popup read (config/colorScales). Shared rather than re-authored:
   * a second palette written against docs/raster-layers.md §6's sample would
   * drift from the swatch the popup quotes, and the two are meant to be one
   * reading of one number.
   */
  scale: ColorScale
  /** How much of the basemap shows through. */
  opacity: number
}

/**
 * Keyed by the **whole** variableKey, product segment included.
 *
 * config/seasonalReadings.ts drops the product from its keys because everything
 * that looks there already knows it is seasonal. This table is the opposite: it
 * spans products by design, so the segment is what keeps a future
 * `drought:rainfall:forecast` from colliding with the seasonal one.
 */
const RASTER_VARIANTS: Record<string, RasterVariant> = {
  'seasonal:rainfall:forecast': {
    product: 'seasonal',
    prefix: 'sf.rainfall',
    scale: RAINFALL_FORECAST_SCALE,
    opacity: 0.8,
  },
  'seasonal:rainfall:percent-of-normal': {
    product: 'seasonal',
    prefix: 'sf.rainfallpn',
    scale: RAINFALL_PERCENT_OF_NORMAL_SCALE,
    opacity: 0.8,
  },
  // No entry for `seasonal:temperature`: the province endpoint carries rainfall
  // only, and nothing is gridded for it (docs/cis-api.md §5). An absent entry is
  // what draws no surface.
}

/** The surface a selected layer is about, or null if it publishes none. */
export function rasterVariantFor(key: string | null): RasterVariant | null {
  const parts = parseVariableKey(key)
  if (!parts) return null
  const full = parts.layerId
    ? `${parts.productId}:${parts.variableId}:${parts.layerId}`
    : `${parts.productId}:${parts.variableId}`
  return RASTER_VARIANTS[full] ?? null
}

/**
 * The URL of one published image.
 *
 * Null when the variant names a product with no raster layout — which is a
 * configuration gap rather than a missing month, and so is not the same thing as
 * the 404 a month with no published image answers with.
 *
 * The extension stays in the path deliberately: the decoder in
 * weatherlayers-gl picks its image path by substring (`url.includes('.webp')`)
 * and otherwise falls through to GeoTIFF, so anything fronting these in
 * production must preserve it (docs/raster-layers.md §7).
 */
export function rasterUrl(
  variant: RasterVariant,
  step: string,
  issuedAt: string,
  ext: RasterExt = 'webp',
): string | null {
  const source = RASTER_SOURCES[variant.product]
  if (!source) return null
  const key = source.key({ prefix: variant.prefix, issuedAt, step, ext })
  return `${RASTER_BASE_URL}/${source.bucket}/${key}`
}

/**
 * A colour scale as the raster layer wants it.
 *
 * cpt2js — which is what parses `palette` inside RasterLayer — takes a list of
 * `[value, [r, g, b]]` stops and interpolates between them, which is the same
 * shape and the same reading as ColorScale's own `colorAt`. Derived from the
 * authored breaks rather than restated, so the surface, the legend and the
 * popup swatch cannot end up describing different colours for one value.
 */
export type RasterPalette = [number, [number, number, number]][]

/**
 * Memoised per scale, because the layer is rebuilt on every frame of a
 * cross-fade and the palette does not change between them. Weak, so a scale
 * that stops being referenced does not pin its palette in memory.
 */
const palettes = new WeakMap<ColorScale, RasterPalette>()

export function rasterPalette(scale: ColorScale): RasterPalette {
  const cached = palettes.get(scale)
  if (cached) return cached

  const palette: RasterPalette = scale.breaks.map((step) => [
    step.value,
    chroma(step.color).rgb() as [number, number, number],
  ])
  palettes.set(scale, palette)
  return palette
}
