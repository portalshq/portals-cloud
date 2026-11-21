import type { Metadata } from 'next'
import './globals.css'
import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'channels',
  description: 'Rooms to gather, play, watch, and make your mark.',
  icons: {icon: '/favicon.svg'},
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-content">{children}</div>
      </body>
    </html>
  )
}
