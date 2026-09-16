import chroma from 'chroma-js'
import type { CisProductName } from '@/api/products'
import type { ColorScale, SymbologyMode } from './colorScales'
import {
  DEFAULT_SYMBOLOGY_MODE,
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
  /**
   * How that table is applied to the surface: flat per class, or interpolated
   * between the breaks.
   *
   * Declared per published raster, beside `opacity`, because it is the same kind
   * of fact — a property of how this product draws, settled by whoever configures
   * the product rather than by whoever is reading the map. PAGASA's seasonal maps
   * are classed, so both entries below say so; a product that publishes a genuinely
   * continuous field says `ramp` here and nothing else has to change.
   *
   * Required rather than defaulted. A surface is painted one way or the other and
   * there is no neutral answer, so a new variant is made to state which it is
   * instead of inheriting a choice its author never saw.
   */
  mode: SymbologyMode
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
    mode: 'step',
    opacity: 0.8,
  },
  'seasonal:rainfall:percent-of-normal': {
    product: 'seasonal',
    prefix: 'sf.rainfallpn',
    scale: RAINFALL_PERCENT_OF_NORMAL_SCALE,
    // The published table is a classification, not a gradient: PAGASA names
    // four bands and draws each one flat (config/colorScales). An interpolated
    // render of it would invent colours between "below" and "near normal" that
    // the bulletin has no word for.
    mode: 'step',
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
 * How a selected layer's values are coloured, wherever they are shown.
 *
 * The surface reads its own variant directly; this exists for everything that
 * colours a value *beside* the surface — the popup's swatch, a station's pill —
 * so they resolve the same answer from the same place and cannot disagree with
 * the field under them.
 *
 * Falls back for a layer that publishes no raster, which is a real shape rather
 * than a gap: seasonal temperature is station-only (docs/cis-api.md §5), so
 * there is no surface to agree with and DEFAULT_SYMBOLOGY_MODE settles it.
 */
export function symbologyModeFor(key: string | null): SymbologyMode {
  return rasterVariantFor(key)?.mode ?? DEFAULT_SYMBOLOGY_MODE
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
 * shape and the same reading as ColorScale's own `colorAt`. Always derived from
 * an authored table and never restated, so the surface, the legend and the
 * popup swatch cannot end up describing different colours for one value.
 *
 * Interpolation is the only thing cpt2js does, so flat classes are expressed in
 * the same currency: stops close enough together that the ramp between them is
 * the class boundary. Which of the two a surface gets is SymbologyMode, and it
 * is the same setting the popup swatch and the station pills read — see
 * config/colorScales and STEP_EDGE below.
 */
export type RasterPalette = [number, [number, number, number]][]

/**
 * How far below a class's upper bound its colour is repeated, as a fraction of
 * the domain.
 *
 * A step palette is a ramp with its stops doubled: each class states its colour
 * at its lower bound and again just under the next one, so the interpolation
 * cpt2js is going to do anyway happens across a gap instead of across the class.
 * The gap sits *below* the break rather than above it because a class owns its
 * lower bound — `classAt` is inclusive there — so the break itself has to be the
 * first value painted in the new colour.
 *
 * It cannot be zero: chroma needs a strictly ascending domain, and two stops at
 * one position would divide by it. So the gap is a window where the palette is
 * mid-blend while `classAt` still says the lower class, and the size of that
 * window is the whole of what this constant decides. 2^-20 of the domain makes
 * it 0.0005 mm wide on the rainfall table and 0.00001 °C on temperature —
 * narrower than any number CIS publishes, so no value can land in one.
 *
 * Small enough also means *smaller than a texel*: weatherlayers samples the
 * scale 256 times to build the palette texture, and a gap this narrow is never
 * one of the samples. Every texel comes back an authored hex, which is checked
 * for all three tables in config/colorScales. A wider gap — half a texel, say —
 * costs a blended texel at some boundaries and buys nothing.
 */
const STEP_EDGE = 2 ** -20

/**
 * Memoised per scale *and* mode, because the layer is rebuilt on every frame of
 * a cross-fade and the palette does not change between them. Weak, so a scale
 * that stops being referenced does not pin its palettes in memory.
 */
const palettes = new WeakMap<
  ColorScale,
  Partial<Record<SymbologyMode, RasterPalette>>
>()

export function rasterPalette(
  scale: ColorScale,
  mode: SymbologyMode = DEFAULT_SYMBOLOGY_MODE,
): RasterPalette {
  let cached = palettes.get(scale)
  if (!cached) {
    cached = {}
    palettes.set(scale, cached)
  }

  const hit = cached[mode]
  if (hit) return hit

  const palette = mode === 'step' ? stepPalette(scale) : rampPalette(scale)
  cached[mode] = palette
  return palette
}

const rgbOf = (color: string) => chroma(color).rgb() as [number, number, number]

/** The authored breaks, one stop each: cpt2js does the rest. */
function rampPalette(scale: ColorScale): RasterPalette {
  return scale.breaks.map((step) => [step.value, rgbOf(step.color)])
}

/**
 * The same table as flat bands.
 *
 * Read off `classes` rather than `breaks` — the same rows, but named as the
 * ranges they are, which is the whole difference this mode is about.
 *
 * The domain is unchanged: first stop and last stop are still the first and
 * last break, so both modes hand RasterLayer the same palette bounds and
 * toggling repaints the surface without moving a single class boundary. The
 * open-topped last class gets one stop at the top of that domain, and the
 * shader's clamp is what paints everything above it — which is the same
 * treatment the ramp gives its own top, and the same one `classAt` describes.
 */
function stepPalette(scale: ColorScale): RasterPalette {
  const { classes } = scale
  const min = classes[0].from
  const max = classes[classes.length - 1].from
  const edge = (max - min) * STEP_EDGE

  return classes.flatMap((band): RasterPalette => {
    const rgb = rgbOf(band.color)
    return band.to === null
      ? [[band.from, rgb]]
      : [
          [band.from, rgb],
          [band.to - edge, rgb],
        ]
  })
}
