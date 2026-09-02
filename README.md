# Klima

Philippine weather map — a MapLibre client in [client/](client/), containerized
with Docker.

## Architecture

The map is the app; everything else is chrome around it.

| Concern | Choice | Where |
|---|---|---|
| Rendering | maplibre-gl | pinned to 5.x — see below |
| React binding | @vis.gl/react-maplibre | [client/src/map/](client/src/map/) |
| Vector tiles | Martin, **external** | [docs/vector-tiles.md](docs/vector-tiles.md) |
| Basemap | OpenFreeMap (no key) | [map/config/styles.ts](client/src/map/config/styles.ts) |
| UI | shadcn/ui (Base UI, `base-nova`) | [client/src/components/ui/](client/src/components/ui/) |

### The tile server is not in this repo

Martin, PostGIS and the nginx in front of them belong to the **CIS** stack.
Klima only consumes them, and the contract is
[docs/vector-tiles.md](docs/vector-tiles.md). The client half of that contract
lives in exactly one file — [map/config/martin.ts](client/src/map/config/martin.ts) —
so repointing at another environment is one variable:

```bash
VITE_TILES_URL=https://cis.example.gov.ph/tiles
```

Unset, it defaults per mode: `http://localhost:3001` in development (Martin
echoes the request Origin, so no proxy is needed), and same-origin `/tiles` in a
production build, which [nginx.conf.template](client/nginx.conf.template)
proxies. That default **must resolve to an absolute URL** before it reaches
MapLibre — MapLibre rejects a relative `style.sprite` and aborts the entire
style load, not just the sprite. `TILES_BASE_URL` handles that; see the comment
there before changing it.

The stacks share one Docker host, so ports and container names collide across
projects. Klima publishes **5173** (dev) and **8081** (prod — 8080 is CIS's
nominatim).

### Map code layout

```
client/src/map/
├── MapRoot.tsx          <Map> + providers; DataLayers sets paint order
├── config/              ids, Martin endpoints, basemaps, initial camera
├── state/               settings shared across the <Map> boundary (context)
├── sources/             one component per Martin source
├── layers/              LAYER_ORDER (paint order) + WEATHER_LAYERS registry
├── hooks/               map instance, events, sprite images, catalog
├── interactions/        camera behaviour (elastic bounds)
├── controls/            toolbar + native MapLibre controls
├── panels/              layer panel
├── types/               tile feature schemas
└── utils/               pure helpers (bbox, style rewriting)
```

Two rules carry most of the weight:

- **Ids live in `config/constants.ts`**, never inline. Imperative calls
  (`setFeatureState`, `queryRenderedFeatures`) reference them from files other
  than the JSX that declares them, so literals drift silently.
- **`layers/index.ts` declares paint order.** MapLibre draws in mount order,
  which is spread across components and easy to get wrong; that array is the one
  place the intended order is written down.

### Adding a weather overlay

The scaffold ships with the basemap and admin boundaries only. A new overlay is
three edits: a `<Source>` in `map/sources/`, mounted in `DataLayers` at the right
position, its ids added to `config/constants.ts` and `layers/index.ts`, and a
`WeatherLayerDefinition` pushed to `WEATHER_LAYERS` — the layer panel renders
whatever is in that registry, so no UI change is needed.

### maplibre-gl is pinned to 5.x

v6 removed `map.transform`, which @vis.gl/react-maplibre still uses; upgrading
blanks the app. The `^5` range is deliberate — do not widen it.

MLT (roughly half the payload of MVT) is supported by Martin and by
maplibre-gl's *runtime* style spec, but `encoding` is missing from the bundled
TypeScript definitions, so it is off behind `USE_MLT` in `config/martin.ts`.

## Development

Vite dev server with HMR, source bind-mounted from the host:

```bash
docker compose up
```

→ http://localhost:5173

Edits to `client/src` reload live.

### Installing dependencies

`node_modules` lives in an anonymous volume (see [docker-compose.yml](docker-compose.yml))
so the bind-mounted host copy never shadows the image's. That volume is seeded
once, when the image is built, and then persists across restarts. Editing
`package.json` therefore does *not* reach the container, and Vite fails with
`Failed to resolve import "<package>"`.

Install on the host, then re-seed the volume:

```bash
cd client
npm install <package>   # updates package.json + package-lock.json
cd ..
docker compose up -d --build --renew-anon-volumes
```

`--build` reinstalls into the image; `--renew-anon-volumes` discards the stale
volume so the container actually picks up that new layer. **`docker compose up
--build` alone is not enough** — the old volume survives the rebuild and keeps
masking the fresh `node_modules`.

Run the same command after pulling changes that touch `package.json`.

Installing from inside the container instead
(`docker compose exec client npm install <package>`) also works, but it runs as
root, so the rewritten `package.json` and `package-lock.json` come back
root-owned on the host.

## Production

Multi-stage build (Node builds the bundle, nginx serves it):

```bash
docker compose --profile prod up --build
```

→ http://localhost:8081

nginx is configured with an SPA fallback, so client-side routes resolve to
`index.html`, and long-lived caching for hashed `/assets`. It also proxies
`/tiles/` to Martin, which is what makes tiles same-origin in production; the
upstream is `TILES_UPSTREAM`, substituted into
[nginx.conf.template](client/nginx.conf.template) at container start.

## UI components

shadcn/ui, Base UI primitives, `base-nova` style. Add components with the CLI
rather than by hand:

```bash
cd client
npx shadcn@latest add <component>
```

Generated files land in `client/src/components/ui/` and are not hand-maintained
— `.oxlintrc.json` exempts them from `react/only-export-components` for that
reason, since they idiomatically export cva variants alongside the component.

The CLI resolves `@/` through the **root** `client/tsconfig.json`, which is why
that otherwise-empty solution file carries a `baseUrl`/`paths` block. Remove it
and `shadcn add` silently writes to a literal `client/@/` directory instead of
`src/`.

## Without Docker

```bash
cd client
npm install
npm run dev
```
