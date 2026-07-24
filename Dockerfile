ARG XRAY_IMAGE=ghcr.io/xtls/xray-core:latest
ARG NODE_IMAGE=node:24-alpine

FROM ${XRAY_IMAGE} AS xray

FROM ${NODE_IMAGE} AS web-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE}
RUN apk add --no-cache ca-certificates tini
WORKDIR /app

COPY --from=xray /usr/local/bin/xray /usr/local/bin/xray
COPY --from=xray /usr/local/share/xray /usr/local/share/xray
COPY server ./server
COPY --from=web-build /build/dist ./dist

RUN mkdir -p /data /app/data \
    && chown -R node:node /data /app/data \
    && chmod 755 /usr/local/bin/xray

ENV NODE_ENV=production \
    WEBXRAY_HOST=0.0.0.0 \
    WEBXRAY_PORT=3000 \
    WEBXRAY_DATA_DIR=/data \
    WEBXRAY_PUBLIC_DIR=/app/dist \
    XRAY_BIN=/usr/local/bin/xray \
    XRAY_LOCATION_ASSET=/usr/local/share/xray

VOLUME ["/data"]
EXPOSE 3000 10808/tcp 10808/udp
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.mjs"]

HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
