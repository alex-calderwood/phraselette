# Phraselette — static single-page app; every model runs in the visitor's browser.
#
#   docker build -t phraselette .
#   docker run --rm -p 3027:3027 phraselette
#   → http://<host>:3027/phraselette/   (health: /healthz)
#
# Stage 1 builds the Vite bundle on a glibc image. --ignore-scripts skips
# onnxruntime-node's binary download (a Node-only dependency of Transformers.js
# that the browser bundle never uses); the app's own scripts (prebuild copies
# the ONNX Runtime wasm files) run as part of `npm run build`.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: a tiny Node image serving dist/ with the dependency-free server.mjs.
FROM node:22-alpine
ENV NODE_ENV=production PORT=3027
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs ./
EXPOSE 3027
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:3027/healthz || exit 1
USER node
CMD ["node", "server.mjs"]
