FROM node:20-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache curl \
    && addgroup -S exporter \
    && adduser -S exporter -G exporter

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chown -R exporter:exporter /usr/src/app
USER exporter

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3030/health || exit 1

CMD ["node", "index.js"]
