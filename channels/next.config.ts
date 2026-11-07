import type { NextConfig } from 'next'
import { resolve } from 'node:path'

const nextConfig: NextConfig = {
  // Channels only uses HLS; the video package's optional WebRTC SDK is not installed.
  turbopack: {
    resolveAlias: { '@reactor-team/js-sdk': './lib/reactor-unavailable.ts' },
  },
  webpack(config) {
    config.resolve.alias['@reactor-team/js-sdk'] = resolve(process.cwd(), 'lib/reactor-unavailable.ts')
    return config
  },
  images: {
    unoptimized: true,
  },
  // The admin SPA is a static Vite build in public/admin; mount its entry
  // point at /admin (assets already resolve under /admin/ via the Vite base).
  async rewrites() {
    return [{ source: '/admin', destination: '/admin/index.html' }]
  },
}

export default nextConfig
