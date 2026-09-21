import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { canonical, orgWebSiteJsonLd, SITE_DESCRIPTION } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'),
  title: 'Production memory for AI-native creative teams | portals',
  description: SITE_DESCRIPTION,
  icons: { icon: '/favicon.svg' },
  robots: 'index, follow',
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: 'Production memory for AI-native creative teams | portals',
    description: SITE_DESCRIPTION,
    type: 'website',
    siteName: 'portals',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Production memory for AI-native creative teams | portals',
    description: SITE_DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover" />
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              imports: {
                three: 'https://unpkg.com/three@0.184.0/build/three.module.js',
                'three/addons/': 'https://unpkg.com/three@0.184.0/examples/jsm/',
              },
            }),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if(location.hostname==="portals.works"||location.hostname==="www.portals.works"){function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,o.onload=function(){window.trackingFunctions.onLoad({appId:"6a6666d5074ba80014945990"})},document.head.appendChild(o)}initApollo()}',
          }}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgWebSiteJsonLd()) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
