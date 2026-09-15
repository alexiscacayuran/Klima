/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Vite only exposes vars prefixed `VITE_`, and only inlines the ones it can see
 * at build time — declaring them here is what stops `import.meta.env.VITE_…`
 * from being `any` at every call site.
 */
interface ImportMetaEnv {
  /**
   * Origin (or same-origin path prefix) of the Martin tile server.
   *
   * Optional: config/martin.ts falls back to a per-mode default, so a plain
   * checkout runs against the local CIS stack with no .env file at all.
   */
  readonly VITE_TILES_URL?: string

  /**
   * Origin (or same-origin path prefix) of the MinIO holding the raster
   * surfaces — the **origin only**, with no bucket: the bucket belongs to the
   * product and is declared in config/rasters.ts.
   *
   * Optional, same as the tiles above: config/rasters.ts falls back to a
   * per-mode default.
   */
  readonly VITE_RASTER_URL?: string

  /**
   * Base path of the CIS JSON API. Defaults to the same-origin `/api/v1` in
   * every mode — the API sends no CORS headers, so it is proxied rather than
   * reached directly (docs/cis-api.md §1).
   */
  readonly VITE_API_URL?: string

  /**
   * Bearer token for the CIS API, for a deployment with no proxy of its own to
   * inject one.
   *
   * Prefer CIS_API_TOKEN, which is unprefixed and so stays in the Vite process
   * (dev) or the nginx container (build). Anything VITE_-prefixed is compiled
   * into the bundle and served to every visitor.
   */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
