import { BASEMAPS, BASEMAP_LABELS } from '@/map/config/styles'
import type { BasemapId } from '@/map/config/styles'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
}

/**
 * Basemap switcher.
 *
 * Plain DOM positioned over the map rather than a maplibre IControl, because it
 * does not need to sit in a control corner and this way it stays ordinary React
 * that a future UI layer can restyle or replace outright.
 */
export function BasemapToggle({ value, onChange }: Props) {
  const ids = Object.keys(BASEMAPS) as BasemapId[]

  return (
    <div className="basemap-toggle" role="group" aria-label="Basemap">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {BASEMAP_LABELS[id]}
        </button>
      ))}
    </div>
  )
}
