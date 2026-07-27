# Klima

React + Vite frontend in [client/](client/), containerized with Docker.

## Development

Vite dev server with HMR, source bind-mounted from the host:

```bash
docker compose up
```

→ http://localhost:5173

Edits to `client/src` reload live. After changing `package.json`, rebuild so the
image's `node_modules` picks up the new dependency:

```bash
docker compose up --build
```

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
