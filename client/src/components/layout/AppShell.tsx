import type { ReactNode } from 'react'

/**
 * Full-viewport frame: the map takes all of it.
 *
 * The header this used to carry is gone — the imported design puts the wordmark
 * in a bar floating over the map (see map/controls/TitleSearchBar), and a fixed
 * header above it would have shown the name twice and cost the map a strip of
 * height it uses for the timeline.
 *
 * Still a `h-dvh` grid rather than absolute positioning so the map's box is a
 * real layout box — MapLibre reads its container's size on resize, and a
 * percentage-height chain to an unsized ancestor is the usual cause of a
 * zero-height canvas. A single `1fr` row keeps that property while leaving room
 * to put a row back above or below the map later.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-dvh grid-rows-[1fr] bg-background text-foreground">
      <main className="relative min-h-0">{children}</main>
    </div>
  )
}
