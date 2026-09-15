import { glyphsUrl, spriteUrl } from "./martin";

/**
 * Basemap styles.
 *
 * OpenFreeMap serves full-detail OpenStreetMap vector basemaps with no API key
 * and no signup.
 */
export const BASEMAPS = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  positron: "https://tiles.openfreemap.org/styles/positron",
} as const;

export type BasemapId = keyof typeof BASEMAPS;

/** Dark first: rasters and choropleths read far better on it. */
export const DEFAULT_BASEMAP: BasemapId = "dark";

/**
 * The flat ground each basemap is composed on — and, painted a second time
 * over the land, its sea.
 *
 * utils/basemapStyle → composeGround puts this under the raster as the only
 * thing beneath the forecast surface, and puts it back on top through the water
 * fill to mask the sea. One value for both, necessarily: the mask works by
 * being indistinguishable from the ground it restores, and two colours here
 * would draw a coastline in the difference between them.
 *
 * Per basemap, because with the basemap's own land dimmed to a tenth this is
 * most of what carries the theme — Dark and Light differ in this value, in a
 * ghost of the land tier, and in label ink. One shared colour would leave the
 * toggle changing almost nothing a user could see.
 *
 * Deliberately not the basemap's own background — Positron's near-white and
 * Dark's near-black are both grounds for a map that draws its land opaque, and
 * here the land is a tenth of itself over a raster. A mid grey is what keeps a
 * surface legible through it in either theme.
 */
export const GROUND: Record<BasemapId, string> = {
  dark: "#696969",
  positron: "#d8d9d6",
};

/** Display names for the basemap toggle. */
export const BASEMAP_LABELS: Record<BasemapId, string> = {
  dark: "Dark",
  positron: "Light",
};

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
  regular: ["Noto Sans Regular"],
  bold: ["Noto Sans Bold"],
} as const;

/**
 * Sprite images Martin publishes in the `markers` sheet.
 *
 * Kept in sync with `/catalog` → `sprites.markers.images`. Referencing an
 * `icon-image` outside this list logs "Image not found" on every frame.
 */
export const SPRITE_IMAGES = ["pin", "station", "station-active"] as const;
export type SpriteImage = (typeof SPRITE_IMAGES)[number];

/**
 * Glyph and sprite endpoints injected into whichever basemap is active.
 *
 * Exported as functions, not constants, because TILES_BASE_URL is resolved at
 * module load and these compose on top of it — keeping them lazy means a test
 * can stub the base URL without import-order games.
 */
export const styleAssets = () => ({
  glyphs: glyphsUrl(),
  sprite: spriteUrl("markers"),
});
