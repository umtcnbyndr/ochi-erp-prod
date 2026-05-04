# Multi-stage Dockerfile for Next.js + Prisma
# Optimized for Coolify deployment

# ---- Stage 1: deps ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* .npmrc* ./

# Install pnpm
RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# ---- Stage 2: builder ----
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Enable pnpm in builder
RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

# Generate Prisma client + build
# Public klasoru yoksa olustur (Next.js standalone COPY hata verir)
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm prisma generate
RUN pnpm run build

# ---- Stage 3: runner ----
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma needs the schema at runtime for migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# pnpm structure: Prisma client is under node_modules/.pnpm — copy entire node_modules from builder
# (standalone output already includes traced production deps; we need full prisma cli for migrate deploy)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Entrypoint script runs migrations then starts app
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]
