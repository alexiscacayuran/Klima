/**
 * Paint order, bottom to top.
 *
 * MapLibre draws layers in the order they are added, which for react-maplibre
 * means component mount order — spread across several <Source> components, that
 * is easy to get wrong and hard to review. This array is the single declaration
 * of intended order; `DataLayers` in MapRoot mounts sources to match it, and
 * interaction handlers walk it in reverse for hit-test priority.
 *
 * Adding a layer means adding it here too, or it will not be hit-testable.
 *
 * Note that the basemap contributes no symbol layers — they are stripped in
 * `utils/stripLabels` — so the entire label tier is ordered by this array.
 */
export const LAYER_ORDER: string[] = []
