# syntax=docker/dockerfile:1

# ---- build: type-check and bundle the SPA ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: nginx serves the SPA and proxies /api to the backend (same origin, first-party cookies) ----
FROM nginx:1.29-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.inc.template /etc/nginx/templates/security-headers.inc.template
COPY --from=build /app/dist /usr/share/nginx/html
# Rendered into the config at container start by the image's envsubst step.
ENV BACKEND_URL=http://backend:8080 \
    STORAGE_PUBLIC_ORIGIN=http://localhost:9000 \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
EXPOSE 80
