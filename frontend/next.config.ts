import type { NextConfig } from 'next'

/**
 * Next.js configuration optimized for fast development with Turbopack
 * - Uses Turbopack for dev (10-100x faster HMR) with --turbo flag
 * - Uses webpack for production builds (better compatibility with route re-exports)
 * - WebAssembly support for both bundlers
 * - Optimized package imports for icon libraries
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  serverExternalPackages: ['@automerge/automerge'],
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  trailingSlash: true,
  // Keep /px exactly as requested; the Pages rewrite serves the trailing
  // slash internally without exposing a 308 to crawlers or visitors.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      // Canonical IA: /assessment is canonical, /workflow/* are legacy.
      {source: '/workflow/assessment', destination: '/assessment', permanent: true},
      {source: '/workflow/assessment/:path*', destination: '/assessment', permanent: true},
      {source: '/production-memory/brief', destination: '/resources/production-memory-brief', permanent: true},
      {source: '/production-memory/brief/:path*', destination: '/resources/production-memory-brief', permanent: true},
      {source: '/ai-production-workflow-risks', destination: '/use-cases', permanent: true},
      // Canonical IA: /pilot is canonical, /paid-pilot/* are legacy.
      {source: '/paid-pilot', destination: '/pilot', permanent: true},
      {source: '/paid-pilot/:path*', destination: '/pilot/:path*', permanent: true},
    ]
  },
  async rewrites() {
    return [
      // Proxy PX landing page from GitHub Pages while keeping /px URL
      {
        source: '/px/:path*',
        destination: 'https://portalshq.github.io/narrativeengine/:path*',
      },
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
