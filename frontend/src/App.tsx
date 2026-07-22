import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { VCS } from './pages/vcs';
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
                    className={`t-header-nav_link h-46 px-12 flex items-center gap-x-8 rounded-sm backdrop-blur-[18px] transition-colors duration-500 pointer-events-auto transform-3d ${
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
            className="md:hidden group relative flex items-center justify-center size-48 rounded-[10px] backdrop-blur-[18px] transition-colors duration-500 pointer-events-auto cursor-pointer bg-white/10 hover:bg-white/30"
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
    <footer className="ui-grid relative z-(--z-footer) gap-y-80 bg-white pt-80 pb-20 text-black-100 lg:gap-y-96 lg:py-36">
      <div className="col-span-full grid grid-cols-subgrid gap-y-80 lg:grid-cols-[var(--width)_1fr_1fr] lg:gap-x-0 lg:gap-y-0">
        <div className="col-span-6 lg:col-span-1">
          <ul className="flex flex-col gap-y-4">
            <li><BracketLink href="https://medium.com/sagaxyz" external>Medium</BracketLink></li>
            <li><BracketLink href="https://discord.com/invite/UCRsTy82Ub" external>Discord</BracketLink></li>
            <li><BracketLink href="https://x.com/SagaAILabs" external>X (Twitter)</BracketLink></li>
            <li><BracketLink href="https://jobs.lever.co/saga-xyz" external>Careers</BracketLink></li>
          </ul>
        </div>

        <div className="col-span-6 place-self-end self-start lg:col-span-1 lg:place-self-start">
          <ul className="flex flex-col gap-y-4">
            {['Overview', 'Platform', 'Agents', 'About'].map((item, index) => (
              <li key={item}>
                <a className="inline-flex transition-opacity duration-250 t-footer-nav_primary-link text-black-100 hover:opacity-50" href={index === 0 ? '/' : `/${item.toLowerCase()}`}>
                  <span>{item}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-full space-y-20 border-t pt-20 lg:col-span-1 lg:space-y-24 lg:place-self-end lg:self-start lg:border-none lg:pt-0">
          <ul className="flex flex-col gap-y-4">
            <li><BracketLink href="/privacy-policy">Privacy Policy</BracketLink></li>
            <li><BracketLink href="/terms-of-service">Terms of Service</BracketLink></li>
          </ul>
        </div>
      </div>

      <div className="col-span-full">
        <svg className="w-full fill-black-100" viewBox="0 0 1646 318" aria-label="Saga">
          <path d="M0,99.2c0,54.79,44.39,99.2,99.16,99.2h198.31c10.95,0,19.83,8.88,19.83,19.84s-8.88,19.84-19.83,19.84H0v79.36H297.47c54.76,0,99.16-44.41,99.16-99.2s-44.39-99.2-99.16-99.2H99.16c-10.95,0-19.83-8.88-19.83-19.84s8.88-19.84,19.83-19.84H396.63V0H99.16C44.39,0,0,44.41,0,99.2Z" />
          <path d="M713.93,0h-198.31c-54.76,0-99.16,44.41-99.16,99.2v218.24h79.33v-119.04h237.98v119.04h79.33V99.2c0-54.79-44.39-99.2-99.16-99.2Zm19.83,119.04h-237.98v-19.84c0-10.96,8.88-19.84,19.83-19.84h198.31c10.95,0,19.83,8.88,19.83,19.84v19.84ZM1546.84,0h-198.31c-54.76,0-99.16,44.41-99.16,99.2v218.24h79.33v-119.04h237.97v119.04h79.33V99.2c0-54.79-44.39-99.2-99.16-99.2Zm19.83,119.04h-237.97v-19.84c0-10.96,8.88-19.84,19.83-19.84h198.31c10.96,0,19.83,8.88,19.83,19.84v19.84ZM932.07,0h297.47V79.36h-297.47c-10.95,0-19.83,8.88-19.83,19.84v119.04c0,10.96,8.88,19.84,19.83,19.84h198.32c10.95,0,19.83-8.88,19.83-19.84V119.04h79.32v99.2c0,54.79-44.39,99.2-99.15,99.2h-198.32c-54.76,0-99.16-44.41-99.16-99.2V99.2c0-54.79,44.39-99.2,99.16-99.2Z" />
        </svg>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <>
      <SagaWebGLEngine />
      <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
      <Header />

      <div className="flex-1 z-(--z-main) flex flex-col">
        <Switch>
          <Route path="/" component={VCS} />
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
