# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/

RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then \
    yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then \
    npm ci; \
  else \
    npm install; \
  fi

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm --filter web build; \
  elif [ -f yarn.lock ]; then \
    yarn workspace web build; \
  else \
    npm run build --workspace=web; \
  fi

# Stage 3: Production (standalone)
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=build /app/apps/web/public ./public
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

USER nextjs

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "apps/web/server.js"]
