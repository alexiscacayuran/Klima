import type { StyleSpecification } from 'maplibre-gl'

/**
 * Removes the basemap's own symbol layers, leaving the label tier to us.
 *
 * Every text label and map icon in a MapLibre style lives in a `symbol` layer,
 * so dropping that type strips them wholesale — in the OpenFreeMap styles that
 * is 15 layers for Dark (13 text, 2 one-way arrows) and 19 for Positron.
 *
 * The one-way arrows are not labels, but they are removed too on purpose: they
 * occupy the same symbol tier our layers will, and leaving them means basemap
 * symbols and ours collide for placement with no way to order them.
 */
export function stripSymbolLayers(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== 'symbol'),
  }
}

/**
 * Repoints a style's glyph and sprite endpoints at Martin.
 *
 * Both basemaps ship their own `glyphs`/`sprite` URLs, and those serve different
 * fontstacks from each other and from Martin. Leaving them alone would mean a
 * `text-font` that renders under Dark silently renders nothing under Light.
 * Rewriting both to Martin makes FONTS and SPRITE_IMAGES in config/styles true
 * regardless of basemap.
 *
 * Applied after stripSymbolLayers, which removes the only layers that were
 * using the basemap's own glyphs — so nothing is left pointing at the old URLs.
 */
export function withMartinAssets(
  style: StyleSpecification,
  assets: { glyphs: string; sprite: string },
): StyleSpecification {
  return { ...style, glyphs: assets.glyphs, sprite: assets.sprite }
}
