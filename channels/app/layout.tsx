import type { Metadata } from 'next'
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-display-face',
  display: 'swap',
})

const body = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-body-face',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'channels',
  description: 'Rooms to gather, play, watch, and leave a mark.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
