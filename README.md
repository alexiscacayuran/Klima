# Klima

React + Vite frontend in [client/](client/), containerized with Docker.

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

→ http://localhost:8080

nginx is configured with an SPA fallback, so client-side routes resolve to
`index.html`, and long-lived caching for hashed `/assets`.

## Without Docker

```bash
cd client
npm install
npm run dev
```
