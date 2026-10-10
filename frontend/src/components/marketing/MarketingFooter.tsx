'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

export function MarketingFooter() {
  const pathname = usePathname()
  const isPx = pathname === '/px' || pathname === '/px/'
  const footerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const desktop = window.matchMedia('(min-width: 64rem)')
    let frame = 0

    const update = () => {
      frame = 0
      const footerTop = footer.getBoundingClientRect().top
      document.querySelectorAll<HTMLElement>('.saga-webgl-viewport').forEach(viewport => {
        if (desktop.matches) {
          viewport.style.removeProperty('clip-path')
          return
        }

        // Keep the canvas anchored at the viewport top; reveal only the part
        // above the transparent footer as it enters the screen.
        const bounds = viewport.getBoundingClientRect()
        const visibleHeight = Math.max(0, Math.min(bounds.height, footerTop - bounds.top))
        viewport.style.clipPath = `inset(0 0 ${bounds.height - visibleHeight}px 0)`
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(footer)
    observer.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    desktop.addEventListener('change', schedule)
    schedule()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      desktop.removeEventListener('change', schedule)
      document.querySelectorAll<HTMLElement>('.saga-webgl-viewport').forEach(viewport => {
        viewport.style.removeProperty('clip-path')
      })
    }
  }, [pathname])

  return (
    <footer
      ref={footerRef}
      className="ui-grid relative z-(--z-footer) min-h-[52vh] pb-(--spacing-sms) text-white lg:pt-50"
      style={isPx ? { backgroundColor: '#000', isolation: 'isolate' } : undefined}
    >
      {!isPx && <div
        className="pointer-events-none absolute inset-x-0 -top-128 bottom-0 z-0"
        aria-hidden="true"
        style={{
          WebkitBackdropFilter: 'blur(18px)',
          backdropFilter: 'blur(18px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, rgb(0 0 0 / 0.18) 48px, rgb(0 0 0 / 0.72) 104px, black 176px)',
          maskImage: 'linear-gradient(to bottom, transparent 0px, rgb(0 0 0 / 0.18) 48px, rgb(0 0 0 / 0.72) 104px, black 176px)',
          background: 'linear-gradient(to bottom, transparent 0px, rgb(255 255 255 / 0.015) 48px, rgb(255 255 255 / 0.055) 112px, rgb(255 255 255 / 0.1) 176px)',
        }}
      />}
      <div className="col-span-full relative z-10 flex flex-col gap-y-fluid-[32,40]">
        <div className="col-span-full m-0 grid h-full grid-cols-1 space-y-fluid-[32,40] p-0 ui-grid lg:grid-cols-5">
          <div className="col-span-full mb-24 lg:col-span-2 lg:mb-0">
            <Link href="/" className="t-d1-sans !font-medium">portals</Link>
            <p className="mt-24 max-w-md t-p-sans">the production memory for AI-native creative teams.</p>
          </div>
          <div className="col-span-full grid gap-y-32 sm:grid-cols-3 lg:col-span-3">
            <nav aria-label="Explore" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/60">explore</h2>
              <ul className="space-y-8 t-p-sans lg:text-white/80">
                <li><Link href="/use-cases" className="transition-colors hover:text-white">use cases</Link></li>
                <li><Link href="/production-memory" className="transition-colors hover:text-white">production memory</Link></li>
                <li><Link href="/blog" className="transition-colors hover:text-white">blog</Link>
                </li>
                <li><Link href="/px" className="transition-colors hover:text-white">px</Link></li>
                <li><Link href="/assessment" className="transition-colors hover:text-white">assess your workflow</Link></li>
                <li><Link href="/production-memory#download" className="transition-colors hover:text-white">download the production memory brief</Link></li>
              </ul>
            </nav>
            <nav aria-label="Work with Portals" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/60">get started</h2>
              <ul className="space-y-8 t-p-sans lg:text-white/80">
                <li><Link href="/pilot" className="transition-colors hover:text-white">paid pilot</Link></li>
                <li><Link href="/security-and-architecture" className="transition-colors hover:text-white">security</Link></li>
                <li><Link href="/contact" className="transition-colors hover:text-white">contact us</Link></li>
              </ul>
            </nav>
            <nav aria-label="Legal" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/60">legal</h2>
              <ul className="space-y-8 t-p-sans lg:text-white/80">
                <li><Link href="/privacy-policy" className="transition-colors hover:text-white">privacy</Link></li>
                <li><Link href="/terms-of-service" className="transition-colors hover:text-white">terms of service</Link></li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="relative z-10 col-span-full row-start-last flex flex-col items-center pt-12 t-p-sm-sans text-white lg:col-span-3 lg:col-start-3 lg:items-start"><span>© 2026 portals.works</span></div>
      </div>
    </footer>
  )
}
