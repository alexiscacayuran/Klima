/**
 * A stub standing in for the `geotiff` package.
 *
 * `geotiff` is an **optional** peer of weatherlayers-gl, reached through a
 * dynamic `import('geotiff')` inside a try/catch: the loader picks its decoder
 * by substring and only falls through to GeoTIFF for a URL that is not a
 * `.webp`/`.png`/`.jpg`. Klima asks for `.webp` and nothing else
 * (config/rasters.ts), so that branch is unreachable here.
 *
 * Unreachable is not the same as unresolvable. Rollup still has to resolve the
 * specifier to bundle weatherlayers-gl at all, and with the package absent
 * `vite build` fails outright — so this file exists to be resolved, not to be
 * run. Aliased in vite.config.ts.
 *
 * Installing the real thing would work too, at ~500 kB for a code path this app
 * cannot reach. If Klima ever renders the COGs beside the WebPs — they hold the
 * original Float32 values, which is what QGIS reads them for — drop the alias
 * and add the dependency rather than filling this in.
 */
const unavailable = () => {
  throw new Error(
    "geotiff is not bundled: Klima loads .webp rasters only. See src/shims/geotiff.ts.",
  )
}

export const fromUrl = unavailable
export const fromUrls = unavailable
export const fromArrayBuffer = unavailable
export const fromBlob = unavailable

export default { fromUrl, fromUrls, fromArrayBuffer, fromBlob }
