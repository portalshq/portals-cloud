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
      {source: '/assessment', destination: '/workflow/assessment', permanent: true},
      {source: '/assessment/opengraph-image', destination: '/workflow/assessment/opengraph-image', permanent: true},
      {source: '/ai-production-workflow-risks', destination: '/workflow/ai-production-workflow-risks', permanent: true},
      {source: '/use-cases', destination: '/workflow/ai-production-workflow-risks', permanent: true},
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
