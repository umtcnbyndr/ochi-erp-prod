/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // Eczane cadde Excel'i her ay büyüyor (2026-07-21'de 10.3 MB ile eski 10mb
    // limitini aştı → Next gövdeyi kesiyor, "Unexpected end of form" ile sayfa
    // çöküyordu). Uygulama içi limit (MAX_UPLOAD_SIZE_MB) ile aynı tutulmalı —
    // burası düşük kalırsa uygulamanın kendi "dosya çok büyük" mesajı hiç çalışamaz.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Build memory tasarrufu icin ESLint runtime'da degil CI'da çalistirilir.
  // (typecheck ayri komutla, lint local'de kontrol ediliyor — production
  // build'de tekrar çalismasi VPS RAM'inde OOM kill yaratiyor)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
