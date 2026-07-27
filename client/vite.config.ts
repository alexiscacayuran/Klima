import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so the dev server is reachable from outside the container.
    host: true,
    port: 5173,
    // Bind-mounted source on Docker Desktop / WSL2 does not emit inotify events.
    watch: { usePolling: true },
  },
  preview: {
    host: true,
    port: 4173,
  },
})
