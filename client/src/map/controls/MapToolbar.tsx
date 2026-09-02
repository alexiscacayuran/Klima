import { Layers, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMapSettings } from '@/map/state/useMapSettings'
import { useMartinCatalog } from '@/map/hooks/useMartinCatalog'
import { MARTIN_SOURCES } from '@/map/config/martin'
import { AdminLevelSelect } from './AdminLevelSelect'
import { BasemapToggle } from './BasemapToggle'

/**
 * The floating control bar over the map.
 *
 * Deliberately a plain absolutely-positioned element rather than a maplibre
 * IControl: IControl would put it inside the map's own DOM, where portal-based
 * shadcn overlays (Select popups, Tooltips) would be clipped by the canvas
 * container's stacking context. Sitting outside <Map> costs nothing — settings
 * travel by context, not props.
 */
export function MapToolbar() {
  const { showBoundaries, setShowBoundaries } = useMapSettings()
  const catalog = useMartinCatalog()

  // The tile server is a separate stack. Saying so explicitly is the difference
  // between a diagnosable error and an empty ocean.
  const boundariesPublished =
    catalog.status === 'ready' &&
    MARTIN_SOURCES.adminBoundaries in catalog.catalog.tiles

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background/85 px-3 py-2 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <Label htmlFor="boundaries" className="text-sm">
            Boundaries
          </Label>
          <Switch
            id="boundaries"
            checked={showBoundaries}
            onCheckedChange={setShowBoundaries}
          />
        </div>

        <AdminLevelSelect />

        <Separator orientation="vertical" className="h-6" />

        <BasemapToggle />

        {catalog.status === 'error' && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="destructive">
                  <TriangleAlert data-icon="inline-start" />
                  Tiles offline
                </Badge>
              }
            />
            <TooltipContent>
              {catalog.error.message}. Is the CIS stack running?
            </TooltipContent>
          </Tooltip>
        )}

        {catalog.status === 'ready' && !boundariesPublished && (
          <Badge variant="secondary">Boundaries not published</Badge>
        )}
      </div>
    </div>
  )
}
