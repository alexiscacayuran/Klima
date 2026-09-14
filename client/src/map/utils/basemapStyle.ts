import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { LAYER_IDS } from '@/map/config/constants'
import {
  LABEL_FONT,
  LABEL_HALO,
  LABEL_HALO_BLUR,
  LABEL_HALO_WIDTH,
  PLACE_INK,
  placeClassTextSize,
} from '@/map/config/labelTiers'

/**
 * Edits applied to a basemap style before MapLibre ever sees it.
 *
 * useBasemapStyle fetches the style as JSON rather than handing <Map> a URL for
 * exactly this reason: OpenFreeMap's styles are a starting point, not a finished
 * basemap, and the only place to change them is between the fetch and the map.
 * Everything here is that edit.
 */

/** The symbol layer union member, which maplibre-gl does not re-export by name. */
type SymbolLayer = Extract<LayerSpecification, { type: 'symbol' }>

/**
 * Which of the basemap's own symbol layers survive, by the tile layer they read.
 *
 * `place` only. Over the Philippines that tier is, in practice, city names —
 * Manila, Cebu City, Davao, Iloilo, Baguio and about sixteen more at low zoom,
 * plus the country itself and a scattering of towns as you go in. Checked
 * against the live planet tiles rather than assumed: OSM publishes no `state`
 * feature inside the country at all, so this cannot collide with the
 * administrative names the app draws itself. The two tiers answer different
 * questions — a settlement is where you are, a province is what the forecast is
 * about — and neither repeats the other.
 *
 * Everything else goes. Road names and shields are noise under a weather layer;
 * `road_oneway` arrows are not labels at all but occupy the same symbol tier and
 * would compete with ours for placement; `water_name` is the closest call and is
 * left out only because it is set in italic on Positron and in the place names'
 * own grey on Dark, which puts two unrelated readings in one voice. Adding it
 * back is one word here.
 */
const KEPT_SYMBOL_SOURCE_LAYERS = new Set(['place'])

/**
 * One basemap label layer, restyled onto the app's own label scale.
 *
 * Everything that made these OpenStreetMap's labels rather than this map's is
 * replaced. The font, because the basemaps disagree with each other and with
 * Martin — Dark sets everything in `Noto Sans Regular`, Positron reaches for
 * `Noto Sans Italic` on two of its place layers, and Martin publishes no italic,
 * so those would render nothing under Light and fine under Dark. The case,
 * because every one of these layers is uppercased and the administrative names
 * beside them are proper nouns. The colour and size, because those are the two
 * things that carry the tier (see config/labelTiers), and a basemap's own idea
 * of how loud a town should be knows nothing about the province name it is
 * sitting next to.
 *
 * Two more layout properties go with the icons. The place layers hang a dot off
 * each label — `circle-11` on Dark, `circle_11_black` on Positron — and both
 * live in the basemap's sprite sheet, which withMartinAssets replaces with
 * Martin's `markers`; a reference to an image that is not in the sheet is not an
 * error, it is a console warning every frame. `text-anchor: left` with
 * `text-offset: [0.5, 0.2]` is then a label standing clear of a dot that is no
 * longer there, so both are dropped and the name sits on its own point.
 */
function adoptLabelLayer(layer: SymbolLayer): SymbolLayer {
  const {
    'icon-image': _icon,
    'text-offset': _offset,
    'text-anchor': _anchor,
    'text-transform': _case,
    'text-letter-spacing': _tracking,
    ...layout
  } = layer.layout ?? {}

  // Paint is replaced rather than merged: what is left of the basemap's own
  // paint for a symbol layer is icon colour and a halo, and both are ours now.
  return {
    ...layer,
    layout: {
      ...layout,
      'text-font': LABEL_FONT,
      'text-size': placeClassTextSize(),
    },
    paint: {
      'text-color': PLACE_INK,
      'text-halo-color': LABEL_HALO,
      'text-halo-width': LABEL_HALO_WIDTH,
      'text-halo-blur': LABEL_HALO_BLUR,
    },
  }
}

/**
 * The layer every data layer inserts *before*.
 *
 * MapLibre appends a layer to the top of the style unless told otherwise, and
 * react-maplibre turns that into "whatever mounts last wins" — which is a fine
 * rule for ordering our own layers against each other and a hopeless one for
 * ordering them against the basemap's labels, since those were added before any
 * of our components existed. A raster overlay mounted next year would bury them.
 *
 * So the style carries a fixed insertion point instead: layers that belong under
 * the labels pass `beforeId={LAYER_IDS.labelAnchor}` and land here no matter when
 * they mount, and the label tier stays on top by construction rather than by
 * accident of mount order. Anything mounted *without* a beforeId — the app's own
 * administrative labels — goes above the whole thing, which is where the tier
 * carrying data belongs.
 *
 * Hidden rather than transparent: `visibility: none` keeps it out of the render
 * pass entirely, and a layer still counts for `beforeId` while invisible.
 */
const LABEL_ANCHOR: LayerSpecification = {
  id: LAYER_IDS.labelAnchor,
  type: 'background',
  layout: { visibility: 'none' },
}

/**
 * Keeps the basemap's place labels, drops the rest of its symbol tier, and
 * splits the style in two at LABEL_ANCHOR.
 *
 * The kept layers are moved to the end as a group. In both OpenFreeMap styles
 * they are already the last layers, so this reorders nothing today — it is here
 * so the anchor's promise holds for a basemap that interleaves them, which is
 * the only way "below the labels" can mean one thing.
 */
export function adoptBasemapLabels(style: StyleSpecification): StyleSpecification {
  const base: LayerSpecification[] = []
  const labels: LayerSpecification[] = []

  for (const layer of style.layers) {
    if (layer.type !== 'symbol') {
      base.push(layer)
    } else if (KEPT_SYMBOL_SOURCE_LAYERS.has(layer['source-layer'] ?? '')) {
      labels.push(adoptLabelLayer(layer))
    }
  }

  return { ...style, layers: [...base, LABEL_ANCHOR, ...labels] }
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
 * Applied after adoptBasemapLabels, which is what makes the rewrite safe: the
 * layers that survive it have had their fonts normalised to stacks Martin serves
 * and their sprite references removed, so nothing is left pointing at the old
 * endpoints.
 */
export function withMartinAssets(
  style: StyleSpecification,
  assets: { glyphs: string; sprite: string },
): StyleSpecification {
  return { ...style, glyphs: assets.glyphs, sprite: assets.sprite }
}
