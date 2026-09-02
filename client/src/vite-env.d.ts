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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
