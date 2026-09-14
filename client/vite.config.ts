import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The repo root, not client/ — one .env.development and one .env.production for
  // the whole project, named after Vite's own modes so this file needs no mapping.
  // docker-compose.yml hands the same files to the containers with `env_file:`,
  // and process.env wins inside loadEnv, so both routes agree.
  const envDir = fileURLToPath(new URL("..", import.meta.url));

  // Every variable, not just the VITE_-prefixed ones — the empty prefix is what
  // makes CIS_API_TARGET and CIS_API_TOKEN readable from an env file instead of
  // having to be exported into the shell. It is read *here*, in the config, which
  // runs in Node; nothing in this object is handed to `define`, so an unprefixed
  // variable cannot reach the browser bundle. That is the whole point of keeping
  // the token unprefixed (docs/cis-api.md §2).
  const env = loadEnv(mode, envDir, "");

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      // Mirrors the "paths" entry in tsconfig.app.json.
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      // Listen on all interfaces so the dev server is reachable from outside the container.
      host: true,
      port: 5173,
      // Bind-mounted source on Docker Desktop / WSL2 does not emit inotify events.
      watch: { usePolling: true },
      proxy: {
        // The CIS API sends no CORS headers at all — unlike Martin, which echoes
        // the request Origin — so a fetch straight from :5173 is blocked by the
        // browser even though curl returns 200. It has to be same-origin, which
        // in development means this proxy and in production means the
        // `location /api/` block in nginx.conf.template. src/api/client.ts
        // defaults VITE_API_URL to "/api/v1" against both. See docs/cis-api.md §1.
        //
        // Resolved by the dev server process, not the browser — which is why this
        // is not the VITE_-prefixed pattern VITE_TILES_URL uses, and why its value
        // depends on where that process runs rather than on the environment:
        // .env.development carries the container's host gateway, and a host
        // `npm run dev` overrides it in .env.development.local with localhost,
        // which is also the fallback below.
        "/api": {
          target: env.CIS_API_TARGET || "http://localhost",
          changeOrigin: true,
          // The dev half of the token story, and the counterpart to the
          // Authorization line in nginx.conf.template. Every GET under /api/v1
          // now needs a bearer token (docs/cis-api.md §2), and there are two
          // places to put one: here, where it stays in the Node process and is
          // added to each proxied request, or VITE_API_TOKEN, which is baked
          // into the bundle and served to every visitor. This is the one to
          // reach for; VITE_API_TOKEN remains for deployments that have no
          // proxy of their own to inject it.
          //
          // Unset leaves the header off entirely rather than sending an empty
          // one, so the failure is `401 Not authenticated` — which says "no
          // token configured" — instead of `Invalid or expired token`, which
          // would send whoever debugs it looking at the token they do not have.
          ...(env.CIS_API_TOKEN && {
            headers: { Authorization: `Bearer ${env.CIS_API_TOKEN}` },
          }),
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
    },
  };
});
