# syntax=docker/dockerfile:1

# --- Stage 1: build the static bundle -------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Install deps from the lockfile first so this layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: serve it ----------------------------------------------------
FROM nginx:1.29-alpine AS runtime

# A template, not a finished config: the nginx image's entrypoint runs envsubst
# over /etc/nginx/templates/*.template at start-up, which is what lets one image
# be pointed at a different Martin without a rebuild. Only variables that exist
# in the environment are substituted, so nginx's own $host/$remote_addr are left
# alone.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Where Martin lives, as seen from *this container*. The CIS stack publishes it
# on the host, so the default reaches back out through the Docker host gateway;
# override in docker-compose.yml when the two stacks share a network.
ENV TILES_UPSTREAM=http://host.docker.internal:3001
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
