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

# Where the CIS JSON API lives, same reasoning. Port 80 rather than 3001: the
# Express app is reached through the CIS stack's own nginx, which is what mounts
# it at /api/v1.
ENV API_UPSTREAM=http://host.docker.internal

# Where MinIO is, as reached from *this container*, same reasoning as the two
# above. The ORIGIN ONLY, with no bucket: the app sends the bucket as the first
# path segment after /rasters/, because the bucket belongs to the product rather
# than to the deployment (see nginx.conf.template and map/config/rasters.ts).
#
# A default is mandatory, not tidiness: envsubst only substitutes variables that
# exist, so an undefined one would leave `${RASTER_UPSTREAM}` in the config
# verbatim and nginx would refuse to start on the unknown variable.
ENV RASTER_UPSTREAM=http://host.docker.internal:9000

# The CIS bearer token, injected into every proxied /api/ request by
# nginx.conf.template. Empty by default for two reasons: a token belongs to a
# deployment rather than to an image, and envsubst only substitutes variables
# that exist — an undefined one would leave `${CIS_API_TOKEN}` in the config
# verbatim and nginx would refuse to start on the unknown variable. Empty means
# no header is injected; set it at run time (docker-compose.yml) to authenticate.
ENV CIS_API_TOKEN=""
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
