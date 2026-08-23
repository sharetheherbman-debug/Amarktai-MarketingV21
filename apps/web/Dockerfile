FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/studio/package.json ./packages/studio/package.json
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_MARKETING_BRAND_NAME="Marketing Workspace"
ARG NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION="AI-powered marketing automation, analytics, campaign management and growth operations."
ARG NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_MARKETING_BRAND_NAME=${NEXT_PUBLIC_MARKETING_BRAND_NAME}
ENV NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION=${NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION}
ENV NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL=${NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace=@amarktai/web

FROM node:22-alpine AS production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
USER nextjs

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000 || exit 1

CMD ["node", "apps/web/server.js"]
