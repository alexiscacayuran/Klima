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

export const DEFAULT_BASEMAP: BasemapId = 'dark'

/** Display names for the basemap toggle. */
export const BASEMAP_LABELS: Record<BasemapId, string> = {
  dark: 'Dark',
  positron: 'Positron',
}

/**
 * Fontstacks the OpenFreeMap glyph endpoint actually serves.
 *
 * Both basemaps declare the same `glyphs` URL, and stripping their label layers
 * does not touch it — so our own symbol layers can render text with these
 * regardless of which basemap is active. Naming a font outside this list yields
 * no text at all and only a console warning.
 */
export const FONTS = {
  regular: ['Noto Sans Regular'],
  bold: ['Noto Sans Bold'],
} as const
