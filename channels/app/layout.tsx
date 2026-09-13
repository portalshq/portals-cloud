import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Channels | portals',
  description: 'Living, interactive experiences built on Portals.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
