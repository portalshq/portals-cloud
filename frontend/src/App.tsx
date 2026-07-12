import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Link } from 'wouter';
import Home from '@/pages/home';
import Roadmap from '@/pages/roadmap';
import { VCS } from './pages/vcs';
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
        <div className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <a href="/" className="text-portals-primary">portals</a>
        </div>
        <nav className="hidden md:flex items-end ml-auto mr-8 gap-8 text-sm text-portals-on-surface-variant">
          <a href="#" className="hover:text-white transition-colors">Docs</a>
          <a href="#" className="hover:text-white transition-colors">Pricing</a>
          {/* <a href="#" className="hover:text-white transition-colors">Marketplace</a>
          <a href="#" className="hover:text-white transition-colors">Roadmap</a> */}
        </nav>
        <Button className="bg-primary text-primary-foreground font-mono text-sm px-4 py-2 hover:bg-primary/90 transition-colors -translate-y-[1px] active:translate-y-0">
          Import
        </Button>
      </header>

      <main className="flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={VCS} />
          {/* <Route path="/" component={Home} /> */}
          <Route path="/roadmap" component={Roadmap} />
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/privacy-policy" component={Privacy} />
          <Route component={NotFound} />
        </Switch>
      </main>

      {/* Brutalist Footer */}
      {/* <footer className="border-t border-border bg-card mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-4 gap-8 hairline-grid">
          <div className="hairline-cell p-4">
            <span className="font-mono text-secondary text-sm uppercase block mb-4">Infrastructure</span>
            <ul className="space-y-2 text-sm text-muted-foreground font-mono">
              <li><Link href="#" className="hover:text-primary transition-colors">Compute</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Storage</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Networking</Link></li>
            </ul>
          </div>
          <div className="hairline-cell p-4">
            <span className="font-mono text-secondary text-sm uppercase block mb-4">Resources</span>
            <ul className="space-y-2 text-sm text-muted-foreground font-mono">
              <li><Link href="#" className="hover:text-primary transition-colors">Documentation</Link></li>
              <li><Link href="/roadmap" className="hover:text-primary transition-colors">Roadmap</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">API Reference</Link></li>
            </ul>
          </div>
          <div className="hairline-cell p-4">
            <span className="font-mono text-secondary text-sm uppercase block mb-4">Company</span>
            <ul className="space-y-2 text-sm text-muted-foreground font-mono">
              <li><Link href="#" className="hover:text-primary transition-colors">About</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Blog</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Careers</Link></li>
            </ul>
          </div>
          <div className="hairline-cell p-4 flex flex-col justify-between">
            <span className="font-mono text-primary text-xl uppercase block">PORTALS<br/>CLOUD</span>
            <span className="font-mono text-xs text-muted-foreground mt-4 block">© 2025 PORTALS INC.<br/>ALL SYSTEMS GO.</span>
          </div>
        </div>
      </footer> */}

      {/* Footer */}
      <footer className="lowercase max-w-[1440px] mx-auto pt-24 px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className='col-span-2'>
            <div className="text-6xl font-medium tracking-tight text-portals-primary mb-4">portals</div>
            <p className="text-sm text-portals-on-surface-variant">Asset-native version control platform.</p>
          </div>
          <div>
            <h4 className="font-medium mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-portals-on-surface-variant">
              {/* <li><a href="#" className="hover:text-white transition-colors">About</a></li> */}
              {/* <li><a href="#" className="hover:text-white transition-colors">Marketplace</a></li> */}
              <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
              <li><a target="blank" href="https://cinematic-canvas.netlify.app" className="hover:text-white transition-colors">Studio</a></li>
            </ul>
          </div>
          {/* <div>
            <h4 className="font-medium mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-portals-on-surface-variant">
              <li><a href="#" className="hover:text-white transition-colors">About</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
            </ul>
          </div> */}
          <div>
            <h4 className="font-medium mb-4">Subscribe for product updates</h4>
            <div className="flex border border-portals-surface-variant focus-within:border-portals-secondary transition-colors">
              <input 
                type="email" 
                placeholder="you@company.com" 
                className="bg-transparent px-4 py-2 text-sm w-full outline-none text-white placeholder:text-portals-on-surface-variant"
              />
              <button className="px-4 text-portals-on-surface-variant hover:text-white transition-colors">
                <ArrowRight className="w-4 h-4" />
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
