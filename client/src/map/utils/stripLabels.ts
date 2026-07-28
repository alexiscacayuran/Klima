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
 *
 * Top-level `glyphs` and `sprite` are untouched, which is what keeps our own
 * symbol layers able to render text and icons after the strip.
 */
export function stripSymbolLayers(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== 'symbol'),
  }
}
