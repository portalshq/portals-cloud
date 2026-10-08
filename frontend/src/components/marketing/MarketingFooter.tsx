'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export function MarketingFooter() {
  const pathname = usePathname()
  const isPx = pathname === '/px' || pathname === '/px/'
  const footerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const desktop = window.matchMedia('(min-width: 64rem)')
    const offsets = new Map<HTMLElement, number>()
    let frame = 0

    const update = () => {
      frame = 0
      const footerTop = footer.getBoundingClientRect().top
      document.querySelectorAll<HTMLElement>('.saga-webgl-viewport').forEach(viewport => {
        if (desktop.matches) {
          viewport.style.removeProperty('translate')
          offsets.delete(viewport)
          return
        }

        // Recover the undisplaced bottom so scrolling back restores the canvas.
        const bottom = viewport.getBoundingClientRect().bottom + (offsets.get(viewport) ?? 0)
        const offset = Math.max(0, bottom - footerTop)
        viewport.style.translate = `0 ${-offset}px`
        offsets.set(viewport, offset)
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
      offsets.forEach((_, viewport) => viewport.style.removeProperty('translate'))
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
            <a href="/" className="t-d1-sans !font-medium">portals</a>
            <p className="mt-24 max-w-md t-p-sans">the production memory for AI-native creative teams.</p>
          </div>
          <div className="col-span-full grid gap-y-32 sm:grid-cols-3 lg:col-span-3">
            <nav aria-label="Explore" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/60">explore</h2>
              <ul className="space-y-8 t-p-sans lg:text-white/80">
                <li><a href="/use-cases" className="transition-colors hover:text-white">use cases</a></li>
                <li><a href="/production-memory" className="transition-colors hover:text-white">production memory</a></li>
                <li><a href="/blog" className="transition-colors hover:text-white">blog</a>
                </li>
                <li><a href="/px" className="transition-colors hover:text-white">px</a></li>
                <li><a href="/assessment" className="transition-colors hover:text-white">assess your workflow</a></li>
                <li><a href="/production-memory#download" className="transition-colors hover:text-white">download the production memory brief</a></li>
              </ul>
            </nav>
            <nav aria-label="Work with Portals" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/60">get started</h2>
              <ul className="space-y-8 t-p-sans lg:text-white/80">
                <li><a href="/pilot" className="transition-colors hover:text-white">paid pilot</a></li>
                <li><a href="/security-and-architecture" className="transition-colors hover:text-white">security</a></li>
                <li><a href="/contact" className="transition-colors hover:text-white">contact us</a></li>
              </ul>
            </nav>
            <nav aria-label="Legal" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/60">legal</h2>
              <ul className="space-y-8 t-p-sans lg:text-white/80">
                <li><a href="/privacy-policy" className="transition-colors hover:text-white">privacy</a></li>
                <li><a href="/terms-of-service" className="transition-colors hover:text-white">terms of service</a></li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="relative z-10 col-span-full row-start-last flex flex-col items-center pt-12 t-p-sm-sans text-white lg:col-span-3 lg:col-start-3 lg:items-start"><span>© 2026 portals.works</span></div>
      </div>
    </footer>
  )
}
