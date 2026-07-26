ARG XRAY_IMAGE=ghcr.io/xtls/xray-core:26.7.11
ARG NODE_IMAGE=node:24-alpine

FROM ${XRAY_IMAGE} AS xray

FROM ${NODE_IMAGE}
USER root
RUN apk add --no-cache ca-certificates tini
WORKDIR /app

COPY --from=xray /usr/local/bin/xray /usr/local/bin/xray
COPY --from=xray /usr/local/share/xray /usr/local/share/xray
COPY backend/server ./server
COPY frontend ./frontend

RUN mkdir -p /data /app/data \
    && chmod 755 /usr/local/bin/xray

ENV NODE_ENV=production \
    WEBXRAY_HOST=0.0.0.0 \
    WEBXRAY_DATA_DIR=/data \
    WEBXRAY_FRONTEND_DIR=/app/frontend \
    XRAY_BIN=/usr/local/bin/xray \
    XRAY_LOCATION_ASSET=/usr/local/share/xray

VOLUME ["/data"]
EXPOSE 3000 10808/tcp 10808/udp
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/launcher.mjs"]

HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "const fs=require('node:fs');const file=process.env.WEBXRAY_DATA_DIR+'/config.json';const port=process.env.WEBXRAY_PORT||JSON.parse(fs.readFileSync(file)).webPort||3000;fetch('http://127.0.0.1:'+port+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
