/**
 * Shape of Martin's `/catalog` response.
 *
 * Hand-written rather than generated: the catalog is small, stable, and the
 * only part of Martin's API this app parses. Fields Martin sends but we never
 * read (`content_type`, glyph counts) are omitted deliberately — adding them
 * would imply a contract we do not actually check.
 */
export type MartinCatalog = {
  /** Published tile sources, keyed by source id. */
  tiles: Record<string, { description?: string; content_type?: string }>
  /** Sprite sheets, keyed by sheet id. `images` lists valid `icon-image` values. */
  sprites: Record<string, { images: string[] }>
  /** Fontstacks, keyed by the exact name that goes in `text-font`. */
  fonts: Record<string, { family: string; style: string; glyphs: number }>
  /** Server-side styles. Empty in the CIS stack — styles are composed client-side. */
  styles: Record<string, unknown>
}
