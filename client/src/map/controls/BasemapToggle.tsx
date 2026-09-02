import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BASEMAPS, BASEMAP_LABELS } from '@/map/config/styles'
import type { BasemapId } from '@/map/config/styles'
import { useMapSettings } from '@/map/state/useMapSettings'

const BASEMAP_IDS = Object.keys(BASEMAPS) as BasemapId[]

const isBasemapId = (value: string): value is BasemapId => value in BASEMAPS

/**
 * Dark/Light basemap switch.
 *
 * Base UI's ToggleGroup is array-valued even when `multiple` is false, so the
 * single selection is wrapped and unwrapped here. Deselecting the active item
 * yields an empty array — ignored, because a map with no basemap is not a state
 * worth having; the group behaves as a radio rather than a toggle.
 */
export function BasemapToggle() {
  const { basemap, setBasemap } = useMapSettings()

  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[basemap]}
      onValueChange={([next]) => {
        // shadcn's wrapper fixes the primitive's generic to `string`, so the
        // value comes back widened and has to be narrowed here rather than at
        // the type level.
        if (next && isBasemapId(next)) setBasemap(next)
      }}
      aria-label="Basemap"
    >
      {BASEMAP_IDS.map((id) => (
        <ToggleGroupItem key={id} value={id}>
          {BASEMAP_LABELS[id]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
