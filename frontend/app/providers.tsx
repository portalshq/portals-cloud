'use client'

import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AnalyticsProvider } from '@/components/leads/AnalyticsProvider'
import { SagaWebGLEngine } from '@/lib/SagaWebGLEngine'
import { muiTheme } from '@/lib/mui/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})


export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={muiTheme}>
        <TooltipProvider>
          <SagaWebGLEngine />
          <Suspense fallback={null}>
            <AnalyticsProvider />
          </Suspense>
          <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
            <div className="flex-1 z-(--z-main) flex flex-col">
              {children}
            </div>
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
