import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'

// Noto Sans for the map chrome and Noto Sans Mono for measured values, IDs and
// timestamps. This departs from the PAGASA CIS design system, which specifies
// IBM Plex: the chrome sits directly on the map, and the map's own labels are
// drawn from Martin's `Noto Sans Regular`/`Noto Sans Bold` glyph stacks (see
// map/config/styles.ts FONTS), so a place name in a panel and the same name on
// the map now share one typeface instead of nearly matching.
//
// Imported here rather than from index.css because CSS `@import` must precede
// every rule in the file, which would put these inside the shadcn-generated
// region that `shadcn init` rewrites. Both are variable builds covering
// 100-900, so every weight the chrome uses comes from one file per script.
import '@fontsource-variable/noto-sans'
import '@fontsource-variable/noto-sans-mono'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
