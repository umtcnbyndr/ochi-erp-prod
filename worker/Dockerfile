# Pazar Fiyat Takip worker — ayrı Coolify uygulaması.
# ERP kabından (node:20-alpine) BAĞIMSIZ. Playwright + Chromium hazır imaj.
# Aynı repo, aynı DATABASE_URL; sadece MarketPriceSnapshot/MarketScanRun'a yazar.
#
# Playwright sürümü package.json'daki ile AYNI olmalı (1.61.1) → imaj tag'i eşleşsin.

FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# pnpm (corepack Node ile geliyor)
RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

# Bağımlılıklar — Chromium zaten imajda var, tekrar indirme
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile --prod=false

# Kaynak + Prisma client
COPY . .
RUN pnpm prisma generate

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Sürekli mod (günde 3 tur). Tek tur için Coolify'da CMD'yi override et:
#   node_modules/.bin/tsx worker/index.ts --once
CMD ["node_modules/.bin/tsx", "worker/index.ts"]
