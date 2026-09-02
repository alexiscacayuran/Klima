import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMapSettings } from '@/map/state/useMapSettings'
import { ADMIN_LEVELS, ADMIN_LEVEL_LABELS } from '@/map/types/features'
import type { AdminLevel } from '@/map/types/features'

/**
 * Base UI renders the raw `value` in the trigger unless the root is told how to
 * label it — without this the trigger reads "2" rather than "Provinces".
 * Values are strings because the underlying <select> round-trips them as such.
 */
const LEVEL_ITEMS = ADMIN_LEVELS.map((level) => ({
  value: String(level),
  label: ADMIN_LEVEL_LABELS[level],
}))

/**
 * Administrative tier picker.
 *
 * Selecting a level rewrites the tile URL; AdminBoundaries handles the
 * feature-state clearing that has to accompany it.
 */
export function AdminLevelSelect() {
  const { adminLevel, setAdminLevel, showBoundaries } = useMapSettings()

  return (
    <Select
      items={LEVEL_ITEMS}
      value={String(adminLevel)}
      onValueChange={(value) => setAdminLevel(Number(value) as AdminLevel)}
      disabled={!showBoundaries}
    >
      <SelectTrigger size="sm" className="w-[190px]" aria-label="Administrative level">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {LEVEL_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
