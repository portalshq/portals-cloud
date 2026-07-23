import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { VCS } from './pages/vcs-current';
import { VCS as VCS2 } from './pages/vcs2';
import { VCS as VCS3 } from './pages/vcs3';
import { TermsOfService } from './pages/terms-of-service';
import { Privacy } from './pages/privacy-policy';
import { SagaWebGLEngine } from '@/lib/SagaWebGLEngine';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function SagaLogo() {
  return (
    <svg viewBox="0 0 64 64" className="size-full transition-colors duration-500 fill-white" aria-label="Saga">
      <path
        fillRule="evenodd"
        d="M39.25 3c-4-4-10.49-4-14.5 0L3 24.75c-4 4-4 10.49 0 14.5L24.75 61c4 4 10.49 4 14.5 0L61 39.25c4-4 4-10.49 0-14.5zM52.5 21.79c0-5.66-4.59-10.25-10.25-10.25h-20.5c-5.66 0-10.25 4.59-10.25 10.25v20.5c0 5.66 4.59 10.25 10.25 10.25h20.5c5.66 0 10.25-4.59 10.25-10.25zm-23.4-7.15c1.6-1.6 4.2-1.6 5.8 0l14.5 14.5c1.6 1.6 1.6 4.2 0 5.8l-14.5 14.5c-1.6 1.6-4.2 1.6-5.8 0l-14.5-14.5c-1.6-1.6-1.6-4.2 0-5.8z"
      />
    </svg>
  );
}

function Header() {
  const navItems = ['Overview', 'Platform', 'Agents', 'About'];

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-(--z-header)">
      <div className="flex h-Header-h items-center px-sms">
        <div className="flex flex-1 items-center justify-between gap-x-sgs">
          <a className="pointer-events-auto size-48 md:size-64" href="/">
            <SagaLogo />
          </a>

          <nav className="hidden md:block">
            <ul className="flex gap-x-8">
              {navItems.map((item, index) => (
                <li key={item}>
                  <a
                    className={`t-header-nav_link h-46 px-12 flex items-center gap-x-8 rounded-sm backdrop-blur-[12px] transition-colors duration-500 pointer-events-auto transform-3d ${
                      index === 0 ? 'bg-white/70 text-black-100' : 'bg-white/10 text-white hover:bg-white/30'
                    }`}
                    href={index === 0 ? '/' : `/${item.toLowerCase()}`}
                  >
                    <span>{item}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <button
            data-ignore-menu-click-outside="true"
            className="md:hidden group relative flex items-center justify-center size-48 rounded-[10px] backdrop-blur-[12px] transition-colors duration-500 pointer-events-auto cursor-pointer bg-white/10 hover:bg-white/30"
            aria-label="Open menu"
          >
            <span className="absolute z-20 h-14 w-16 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center transition-all duration-500 border-t-[1.5px] border-b-[1.5px] scale-100 border-white">
              <span className="h-1.5 w-full transition-colors duration-500 bg-white" />
            </span>
            <span className="relative z-30 size-16 transition-all duration-500 scale-0 rotate-180">
              <span className="h-2 w-16 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 transform transition-colors duration-500 bg-white" />
              <span className="h-2 w-16 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 transform transition-colors duration-500 bg-white" />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

function BracketLink({ href, children, external = false }: { href: string; children: string; external?: boolean }) {
  return (
    <a
      className="group inline-flex gap-x-[0.35em] t-link-brackets text-black-100/60 transition-opacity duration-250 hover:opacity-50"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      <span className="transition-transform duration-250 group-hover:translate-x-[-0.35em]">[</span>
      <span>{children}</span>
      <span className="transition-transform duration-250 group-hover:translate-x-[0.35em]">]</span>
    </a>
  );
}

function Footer() {
  return (
    <footer className="ui-grid relative z-(--z-footer) gap-y-80 pt-80 pb-20 text-white lg:gap-y-96 lg:py-36 !lowercase">
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
      <div className="relative z-10 col-span-full grid grid-cols-1 lg:grid-cols-4 gap-12 mb-12">
        <div className='col-span-1 lg:!col-span-2'>
          <div className="t-d2-sans tracking-tight mb-4 !font-medium">portals</div>
          <p className="lowercase text-white t-p-sans">
            The production repository for AI-native creative organizations
          </p>
        </div>
        <div className='col-span-1 lg:col-span-1 pt-90'>
          {/* <h4 className="font-medium mb-4">Company</h4> */}
          <ul className="space-y-2 t-p-sans text-white/80">
            {/* <li><a href="#" className="hover:text-white transition-colors">About</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Contact</a></li> */}
            <li><a href="/privacy-policy" className="hover:text-white transition-colors">Privacy</a></li>
            <li><a href="/terms-of-service" className="hover:text-white transition-colors">terms of service</a></li>
          </ul>
        </div>
      </div>
      <div className="relative z-10 flex flex-col items-center pt-12 text-sm text-white col-span-full">
        <div>© 2026 portals.works</div>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <>
      <SagaWebGLEngine />
      <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
      {/* <Header /> */}

      <div className="flex-1 z-(--z-main) flex flex-col">
        <Switch>
          <Route path="/" component={VCS} />
          <Route path="/2" component={VCS2} />
          <Route path="/3" component={VCS3} />
          {/* <Route path="/interactive" component={InteractiveEntertainment} /> */}
          {/* <Route path="/roadmap" component={Roadmap} /> */}
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/privacy-policy" component={Privacy} />
          <Route component={NotFound} />
        </Switch>
      </div>

      <Footer />
    </div>
    </>
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
