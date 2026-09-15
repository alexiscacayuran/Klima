import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { LAYER_IDS } from "@/map/config/constants";
import {
  LABEL_FONT,
  LABEL_HALO,
  LABEL_HALO_BLUR,
  LABEL_HALO_WIDTH,
  PLACE_INK,
  placeClassTextSize,
} from "@/map/config/labelTiers";

/**
 * Edits applied to a basemap style before MapLibre ever sees it.
 *
 * useBasemapStyle fetches the style as JSON rather than handing <Map> a URL for
 * exactly this reason: OpenFreeMap's styles are a starting point, not a finished
 * basemap, and the only place to change them is between the fetch and the map.
 * Everything here is that edit.
 */

/**
 * How much of the basemap's land survives compositing.
 *
 * One number for the whole tier — the ground the land is painted on, its
 * landuse and landcover, its buildings, roads and railways alike. They are one
 * thing on this map, not thirty, and the only question they answer together is
 * "where is the land, roughly what is on it". A per-layer budget would be a
 * street map's answer to a question a climate map is not asking.
 */
const LAND_OPACITY = 0.15;

/** The opacity property each layer type spells its own way. */
const OPACITY_PROPERTY = {
  background: "background-opacity",
  fill: "fill-opacity",
  line: "line-opacity",
} as const;

type GroundLayerType = keyof typeof OPACITY_PROPERTY;

const isGroundLayer = (
  layer: LayerSpecification,
): layer is Extract<LayerSpecification, { type: GroundLayerType }> =>
  layer.type in OPACITY_PROPERTY;

/** The fill layer union member, which maplibre-gl does not re-export by name. */
type FillLayer = Extract<LayerSpecification, { type: "fill" }>;

/** Whether a layer is the basemap's sea rather than part of its land. */
const isSea = (layer: LayerSpecification): layer is FillLayer =>
  layer.type === "fill" && layer["source-layer"] === "water";

/**
 * Rebuilds the basemap's ground into the three surfaces the map composes on.
 *
 * The first edit applied, and the one the rest of the composition stands on.
 * Bottom to top it emits:
 *
 * 1. **`ground`** — one flat, opaque colour under everything. The raster names
 *    the layer above this as its `beforeId`, so this is the only thing beneath
 *    the forecast surface and the surface is never read against a texture.
 * 2. **`land`**, and behind it every land layer the basemap ships, all at
 *    LAND_OPACITY. This is the landmass: not a polygon — OpenMapTiles publishes
 *    none, and land is simply where the sea was not painted — but the same
 *    *silhouette*, arrived at from the other side. Drawn over the raster, so
 *    the forecast reads through the country as a tint.
 * 3. **`sea`** — the basemap's water fill, repainted opaque in the ground
 *    colour. This is the mask that makes step 2 a landmass at all: it puts the
 *    sea back to bare ground, taking the land tint and the raster off the water
 *    with it, and what is left tinted is exactly the land.
 *
 * Two properties are dropped from the layers that survive.
 *
 * `fill-pattern`, because Dark's `landcover_wood` reaches for `wood-pattern` in
 * the basemap's own sprite sheet and withMartinAssets replaces that sheet with
 * Martin's `markers`. A pattern that is not in the sheet is not an error, it is
 * a console warning every frame — the same trap adoptLabelLayer sidesteps for
 * `icon-image`, and the reason this runs before that rewrite rather than after.
 *
 * Whatever opacity the layer arrived with, because the replacement is flat
 * rather than a multiplication. Several of these ramp opacity on zoom, and
 * `["zoom"]` is only legal as the input to a *top-level* interpolate — so
 * `["*", LAND_OPACITY, <ramp>]` would not dim the layer, it would make MapLibre
 * reject the paint property and drop it. The ramps are a street map fading its
 * furniture in as you approach; at a tenth of full strength there is nothing
 * left for them to modulate.
 *
 * Symbol layers pass through untouched. adoptBasemapLabels runs next and is
 * what decides which of those stay.
 */
export function composeGround(
  style: StyleSpecification,
  ground: string,
): StyleSpecification {
  const layers: LayerSpecification[] = [
    {
      id: LAYER_IDS.ground,
      type: "background",
      paint: { "background-color": ground },
    },
  ];

  for (const layer of style.layers) {
    if (isSea(layer)) continue;
    if (layer.type === "symbol" || !isGroundLayer(layer)) {
      layers.push(layer);
      continue;
    }

    // Keyed rather than destructured: `paint` is a union across the three
    // layer types and no one member declares every property being touched, so
    // spelling either one narrows the object to the wrong arm of it.
    const paint: Record<string, unknown> = { ...layer.paint };
    delete paint["fill-pattern"];
    paint[OPACITY_PROPERTY[layer.type]] = LAND_OPACITY;

    layers.push({
      ...layer,
      // The basemap's own background becomes the land's base coat rather than
      // the map's ground, and takes the id the raster inserts against.
      ...(layer.type === "background" ? { id: LAYER_IDS.land } : {}),
      paint,
    } as LayerSpecification);
  }

  // The mask goes last, over every land layer and under the label seam. Rebuilt
  // rather than restyled in place: what it carried was a sea colour and an
  // antialias flag, and both belong to a basemap that was drawing water rather
  // than hiding it.
  const sea = style.layers.find(isSea);
  if (sea) {
    layers.push({
      ...sea,
      id: LAYER_IDS.sea,
      paint: { "fill-color": ground, "fill-antialias": true },
    });
  }

  return { ...style, layers };
}

/** The symbol layer union member, which maplibre-gl does not re-export by name. */
type SymbolLayer = Extract<LayerSpecification, { type: "symbol" }>;

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
 * Everything else goes. Road names and shields are noise under a raster layer;
 * `road_oneway` arrows are not labels at all but occupy the same symbol tier and
 * would compete with ours for placement; `water_name` is the closest call and is
 * left out only because it is set in italic on Positron and in the place names'
 * own grey on Dark, which puts two unrelated readings in one voice. Adding it
 * back is one word here.
 */
const KEPT_SYMBOL_SOURCE_LAYERS = new Set(["place"]);

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
    "icon-image": _icon,
    "text-offset": _offset,
    "text-anchor": _anchor,
    "text-transform": _case,
    "text-letter-spacing": _tracking,
    ...layout
  } = layer.layout ?? {};

  // Paint is replaced rather than merged: what is left of the basemap's own
  // paint for a symbol layer is icon colour and a halo, and both are ours now.
  return {
    ...layer,
    layout: {
      ...layout,
      "text-font": LABEL_FONT,
      "text-size": placeClassTextSize(),
    },
    paint: {
      "text-color": PLACE_INK,
      "text-halo-color": LABEL_HALO,
      "text-halo-width": LABEL_HALO_WIDTH,
      "text-halo-blur": LABEL_HALO_BLUR,
    },
  };
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
  type: "background",
  layout: { visibility: "none" },
};

/**
 * Keeps the basemap's place labels, drops the rest of its symbol tier, and
 * splits the style in two at LABEL_ANCHOR.
 *
 * The kept layers are moved to the end as a group. In both OpenFreeMap styles
 * they are already the last layers, so this reorders nothing today — it is here
 * so the anchor's promise holds for a basemap that interleaves them, which is
 * the only way "below the labels" can mean one thing.
 */
export function adoptBasemapLabels(
  style: StyleSpecification,
): StyleSpecification {
  const base: LayerSpecification[] = [];
  const labels: LayerSpecification[] = [];

  for (const layer of style.layers) {
    if (layer.type !== "symbol") {
      base.push(layer);
    } else if (KEPT_SYMBOL_SOURCE_LAYERS.has(layer["source-layer"] ?? "")) {
      labels.push(adoptLabelLayer(layer));
    }
  }

  return { ...style, layers: [...base, LABEL_ANCHOR, ...labels] };
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
  return { ...style, glyphs: assets.glyphs, sprite: assets.sprite };
}
