# Static output served by nginx. Multi-stage, small, no runtime environment.
# Base images are pinned to Renovate-parsable tags: a tag Renovate can't order
# is a tag that silently rots for years.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

# CI passes the short SHA so window.__bb.version can prove which build is live.
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# No volume, no writable state, no env at runtime — it's a bag of files.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

EXPOSE 80
