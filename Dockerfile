# The studio: the Node server plus the built site, one image. Railway builds this (railway.json).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-ssr ./dist-ssr
COPY package.json server.mjs ./
COPY src ./src
COPY data/denylist.json ./data/denylist.json
COPY --from=build /app/data/fonts ./data/fonts
COPY scripts ./scripts
RUN mkdir -p /app/data/files && chown -R node:node /app/data
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
