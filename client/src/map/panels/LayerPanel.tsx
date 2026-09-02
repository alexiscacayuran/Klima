import { CloudSun } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { WEATHER_LAYERS } from '@/map/layers'
import { useMapSettings } from '@/map/state/useMapSettings'

/**
 * Weather overlay switchboard.
 *
 * Renders whatever WEATHER_LAYERS contains, so a new overlay needs no change
 * here — that registry plus a <Source> is the whole surface area. Empty until
 * the first overlay lands, which is the honest state to show rather than a
 * panel of placeholder switches.
 */
export function LayerPanel() {
  const { visibleLayers, toggleLayer } = useMapSettings()

  return (
    <Card className="pointer-events-auto absolute top-20 left-3 z-10 w-72 border-border/60 bg-background/85 shadow-lg backdrop-blur-md">
      <CardHeader>
        <CardTitle>Layers</CardTitle>
        <CardDescription>Weather overlays drawn above the basemap.</CardDescription>
      </CardHeader>
      <CardContent>
        {WEATHER_LAYERS.length === 0 ? (
          <Empty className="p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CloudSun />
              </EmptyMedia>
              <EmptyTitle>No overlays yet</EmptyTitle>
              <EmptyDescription>
                Register one in <code>map/layers/index.ts</code> and it appears here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="flex flex-col gap-4">
              {WEATHER_LAYERS.map((layer) => (
                <div key={layer.id} className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`layer-${layer.id}`}>{layer.label}</Label>
                    {layer.description && (
                      <p className="text-xs text-muted-foreground">
                        {layer.description}
                      </p>
                    )}
                  </div>
                  <Switch
                    id={`layer-${layer.id}`}
                    checked={visibleLayers[layer.id] ?? false}
                    onCheckedChange={(checked) => toggleLayer(layer.id, checked)}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
