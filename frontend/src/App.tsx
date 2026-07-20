import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Link } from 'wouter';
import InteractiveEntertainment from '@/pages/interactive-entertainment';
import Roadmap from '@/pages/roadmap';
import { VCS } from './pages/vcs';
import { VCS as VCSPrev } from './pages/vcs-01';
import { VCS as VCSSystemOfRecord } from './pages/vcs-system-of-record';
import { ArrowRight } from 'lucide-react';
import { TermsOfService } from './pages/terms-of-service';
import { Privacy } from './pages/privacy-policy';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function Router() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 h-[10vh] max-w-[1440px] mx-auto w-full">

        <div className="flex items-center gap-3">

          <a
            href="/"
            className="text-2xl font-medium tracking-tight text-portals-primary"
          >
            portals
          </a>

        </div>


        <nav className="hidden lowercase md:flex items-center gap-8 text-portals-on-surface-variant">

          <a
            href="#"
            className="hover:text-white transition-colors"
          >
            Product
          </a>
          <a
            href="#pillars"
            className="hover:text-white transition-colors"
          >
            Pillars
          </a>
          <a
            href="#pricing"
            className="hover:text-white transition-colors"
          >
            Pricing
          </a>
          <a
            href="#docs"
            className="hover:text-white transition-colors"
          >
            Docs
          </a>

        </nav>


        <Button
          className="
      bg-primary 
      text-primary-foreground 
      font-mono 
      text-sm 
      px-5 
      py-2
      hover:bg-primary/90
      transition-colors
    "
        >
          Request access
        </Button>

      </header>

      <main className="flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={VCS} />
          <Route path="/vcs-prev" component={VCSPrev} />
          {/* <Route path="/vcs-system-of-record" component={VCSSystemOfRecord} /> */}
          {/* <Route path="/interactive" component={InteractiveEntertainment} /> */}
          {/* <Route path="/roadmap" component={Roadmap} /> */}
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/privacy-policy" component={Privacy} />
          <Route component={NotFound} />
        </Switch>
      </main>

      <footer className="lowercase max-w-[1440px] mx-auto pt-24 px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className='col-span-1'>
            <div className="text-6xl font-medium tracking-tight text-portals-primary mb-4">portals</div>
            <p className="lowercase text-sm text-portals-on-surface-variant">
              The production repository for AI-native creative organizations.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-portals-on-surface-variant">
              <li><a href="#pillars" className="hover:text-white transition-colors">Pillars</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-portals-on-surface-variant">
              <li><a href="#docs" className="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-portals-on-surface-variant">
              <li><a href="#" className="hover:text-white transition-colors">About</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
          <div className="row-start-2 md:row-start-auto md:col-span-4">
            <h4 className="font-medium mb-4">Subscribe for product updates</h4>
            <div className="flex border border-portals-surface-variant focus-within:border-portals-secondary transition-colors max-w-md">
              <input
                type="email"
                placeholder="you@company.com"
                className="bg-transparent px-4 py-2 text-sm w-full outline-none text-white placeholder:text-portals-on-surface-variant"
              />
              <button className="px-4 text-portals-on-surface-variant hover:text-white transition-colors">
                Subscribe
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-portals-surface-variant text-xs text-portals-on-surface-variant">
          <div>© 2026 portals inc. All rights reserved.</div>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="/privacy-policy" className="hover:text-white transition-colors">privacy policy</a>
            <a href="/terms-of-service" className="hover:text-white transition-colors">terms of service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
