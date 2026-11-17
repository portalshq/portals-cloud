import type { NextConfig } from 'next'
import { resolve } from 'node:path'

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/notifications/verify', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }, {
      // X Player Cards frame only the slim player route; every other route keeps the default.
      source: '/embed/:slug',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com" },
        { key: 'X-Robots-Tag', value: 'noindex' },
      ],
    }]
  },
  serverExternalPackages: ['@portalshq/capability-identity'],
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
