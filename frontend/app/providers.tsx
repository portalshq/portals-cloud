'use client'

import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AnalyticsProvider } from '@/components/leads/AnalyticsProvider'
import { SagaWebGLEngine } from '@/lib/SagaWebGLEngine'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function Footer() {
  return (
    <footer className="ui-grid relative z-(--z-footer) h-[90vh] pb-36 text-white lg:pt-36 !lowercase">
      <div
        className="pointer-events-none absolute inset-x-0 -top-128 bottom-0 z-0"
        aria-hidden="true"
        style={{
          WebkitBackdropFilter: 'blur(18px)',
          backdropFilter: 'blur(18px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, rgb(0 0 0 / 0.18) 48px, rgb(0 0 0 / 0.72) 104px, black 176px)',
          maskImage: 'linear-gradient(to bottom, transparent 0px, rgb(0 0 0 / 0.18) 48px, rgb(0 0 0 / 0.72) 104px, black 176px)',
          background: 'linear-gradient(to bottom, transparent 0px, rgb(255 255 255 / 0.015) 48px, rgb(255 255 255 / 0.055) 112px, rgb(255 255 255 / 0.1) 176px)',
        }}
      />
      <div className="col-span-full relative z-10 flex flex-col gap-y-fluid-[32,40] mb-12">
        <a href="/" className="w-fit t-d1-sans mb-4 !font-medium">portals</a>
        <div className="col-span-full h-full space-y-fluid-[32,40] ui-grid grid-cols-1 grid-rows-[min-content_1fr] lg:grid-cols-5 m-0 p-0">
          <div className='col-span-full lg:col-span-3'>
            <p className="lowercase text-white t-p-sans">
              The production repository for AI-native creative organizations
            </p>
          </div>

          <div className='col-span-full lg:col-span-1 space-y-fluid-[32,40]'>
          {/* <h4 className="font-medium mb-4">Product</h4> */}
            <ul className="space-y-8 lg:space-y-4 t-p-sans text-white/80">
              <li><a href="/privacy-policy" className="hover:text-white transition-colors">Privacy</a></li>
              <li><a href="/terms-of-service" className="hover:text-white transition-colors">terms of service</a></li>
              <li><a href="/security-and-architecture" className="hover:text-white transition-colors">security</a></li>
              <li><a href="/ai-production-workflow-risks" className="hover:text-white transition-colors">use cases</a></li>
            </ul>
            
            <ul className="space-y-8 lg:space-y-4 t-p-sans text-white/80">
              <li><a href="/contact" className="hover:text-white transition-colors">contact portals</a></li>
            </ul>
          </div>
          
        </div>
        <div className="relative z-10 flex flex-col lg:items-center pt-12 t-p-sans text-[1.2em] text-white col-span-full row-start-last">
          <div>© 2026 portals.works</div>
        </div>
      </div>
    </footer>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SagaWebGLEngine />
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
          <div className="flex-1 z-(--z-main) flex flex-col">
            {children}
          </div>
          <Footer />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
