import { glyphsUrl, spriteUrl } from './martin'

/**
 * Basemap styles.
 *
 * OpenFreeMap serves full-detail OpenStreetMap vector basemaps with no API key
 * and no signup.
 */
export const BASEMAPS = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  positron: 'https://tiles.openfreemap.org/styles/positron',
} as const

export type BasemapId = keyof typeof BASEMAPS

/** Dark first: weather rasters and choropleths read far better on it. */
export const DEFAULT_BASEMAP: BasemapId = 'dark'

/** Display names for the basemap toggle. */
export const BASEMAP_LABELS: Record<BasemapId, string> = {
  dark: 'Dark',
  positron: 'Light',
}

/**
 * Fontstacks available to our own symbol layers.
 *
 * These are the names Martin's `/catalog` reports under `fonts`, NOT filenames,
 * and they are what goes in a layer's `text-font`. Naming anything else yields
 * no text at all and only a console warning.
 *
 * Serving glyphs from Martin rather than from the basemap's own endpoint is what
 * keeps label rendering identical across basemaps — the style's `glyphs` is
 * rewritten to Martin in useBasemapStyle, so switching Dark to Light cannot
 * change which fonts resolve.
 */
export const FONTS = {
  regular: ['Noto Sans Regular'],
  bold: ['Noto Sans Bold'],
} as const

/**
 * Sprite images Martin publishes in the `markers` sheet.
 *
 * Kept in sync with `/catalog` → `sprites.markers.images`. Referencing an
 * `icon-image` outside this list logs "Image not found" on every frame.
 */
export const SPRITE_IMAGES = ['pin', 'station', 'station-active'] as const
export type SpriteImage = (typeof SPRITE_IMAGES)[number]

/**
 * Glyph and sprite endpoints injected into whichever basemap is active.
 *
 * Exported as functions, not constants, because TILES_BASE_URL is resolved at
 * module load and these compose on top of it — keeping them lazy means a test
 * can stub the base URL without import-order games.
 */
export const styleAssets = () => ({
  glyphs: glyphsUrl(),
  sprite: spriteUrl('markers'),
})
