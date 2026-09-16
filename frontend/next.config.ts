import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  serverExternalPackages: ['@automerge/automerge'],
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  async redirects() {
    return [
      // Canonical IA: /assessment is canonical, /workflow/* are legacy.
      {source: '/workflow/assessment', destination: '/assessment', permanent: true},
      {source: '/workflow/assessment/:path*', destination: '/assessment', permanent: true},
      {source: '/production-memory/brief', destination: '/resources/production-memory-brief', permanent: true},
      {source: '/production-memory/brief/:path*', destination: '/resources/production-memory-brief', permanent: true},
      {source: '/ai-production-workflow-risks', destination: '/use-cases', permanent: true},
    ]
  },
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '/',
  },
  outputFileTracingIncludes: {
    '/*': [
      './public/fonts/pdf/*',
      './public/images/pdf/*',
      './node_modules/@automerge/automerge/dist/**/*.wasm',
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      syncWebAssembly: true,
    }

    return config
  },
}

export default nextConfig
