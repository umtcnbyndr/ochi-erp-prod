/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
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
