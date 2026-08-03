/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // ⚠️ İKİ AYRI LİMİT — ikisi de MAX_UPLOAD_SIZE_MB ile aynı tutulmalı.
    // Eczane cadde Excel'i her ay büyüyor (2026-08-03'te 10.3 MB ile 10mb
    // varsayılanını aştı → gövde kesiliyor → "Unexpected end of form" →
    // uncaughtException → sayfa çöküyor; uygulamanın kendi "dosya çok büyük"
    // mesajı hiç çalışamıyor çünkü istek ona ulaşmadan kopuyor).
    //
    // 1) Server action yükü:
    serverActions: {
      bodySizeLimit: '25mb',
    },
    // 2) middleware.ts TANIMLI olduğu için gövde ayrıca burada tamponlanıyor
    //    (varsayılan 10MB). middleware matcher'ı /eczane-yukleme dahil tüm
    //    dashboard rotalarını kapsıyor → asıl kesen limit BURASIYDI.
    //    Not: Next 15.5 bu anahtarı okuyor; sonraki sürümlerde adı
    //    `proxyClientMaxBodySize` olacak (deprecation).
    middlewareClientMaxBodySize: '25mb',
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
