FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/studio/package.json ./packages/studio/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@amarktai/api

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apiuser

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/src/db/migrations ./dist/db/migrations
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/version.json ./version.json

RUN mkdir -p /app/uploads/studio /app/uploads/studio/renders && \
    chown -R apiuser:nodejs /app/uploads

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
USER apiuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
