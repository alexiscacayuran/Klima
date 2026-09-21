import { hasOverlay } from '@/map/config/products'
import { rasterVariantFor } from '@/map/config/rasters'
import type { RasterVariant } from '@/map/config/rasters'
import { useSelection } from '@/map/state/useSelection'

/**
 * The surface the selected layer paints, or null if it paints none.
 *
 * A hook rather than a line in RasterOverlay because two things have to agree
 * on the answer: the overlay that draws the surface and the legend that
 * explains it. They sit on opposite sides of <Map>, and a legend resolving the
 * variant its own way would eventually describe a surface nobody is drawing.
 *
 * Two questions, and both have to say yes. `rasterVariantFor` answers whether
 * CIS publishes a surface for this layer; the overlay declaration answers
 * whether the layer is meant to *draw* one. They are usually the same answer
 * and are not the same question — a published surface a product has chosen not
 * to show is a real configuration, and the variant table is the wrong place to
 * express it because it would mean deleting the URL layout to hide the image.
 */
export function useRasterVariant(): RasterVariant | null {
  const { variable } = useSelection()
  return hasOverlay(variable, 'raster') ? rasterVariantFor(variable) : null
}
