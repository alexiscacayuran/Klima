import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'

// The PAGASA CIS design system specifies IBM Plex Sans for UI and IBM Plex Mono
// for measured values, IDs and timestamps. Imported here rather than from
// index.css because CSS `@import` must precede every rule in the file, which
// would put these inside the shadcn-generated region that `shadcn init`
// rewrites. Mono is the static build — there is no variable IBM Plex Mono on
// npm — so only the three weights the design uses are pulled in.
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
