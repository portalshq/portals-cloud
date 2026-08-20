import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '/',
  },
  outputFileTracingIncludes: {
    '/*': ['./public/fonts/pdf/*', './public/images/pdf/*'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
