# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/

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
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm --filter api build; \
  elif [ -f yarn.lock ]; then \
    yarn workspace api build; \
  else \
    npm run build --workspace=api; \
  fi

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./app_modules

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER apiuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
