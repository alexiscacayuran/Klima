import type { ReactNode } from 'react'
import { CloudSun } from 'lucide-react'

/**
 * Full-viewport frame: a slim header over a map that takes the rest.
 *
 * The grid is `auto 1fr` on a `h-dvh` root rather than absolute positioning so
 * the map's box is a real layout box — MapLibre reads its container's size on
 * resize, and a percentage-height chain to an unsized ancestor is the usual
 * cause of a zero-height canvas.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <CloudSun className="size-5 text-primary" />
        <span className="font-heading text-sm font-semibold tracking-tight">Klima</span>
        <span className="text-xs text-muted-foreground">
          Philippine weather map
        </span>
      </header>
      <main className="relative min-h-0">{children}</main>
    </div>
  )
}
