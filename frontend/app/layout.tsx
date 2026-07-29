import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'The Repository for Creative Production Teams | Portals',
  description: 'Portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
  icons: { icon: '/favicon.svg' },
  robots: 'index, follow',
  openGraph: {
    title: 'Version Control for Creative Production Teams | Portals',
    description: 'Portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Version Control for Creative Production Teams | Portals',
    description: 'Portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
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
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
