import React from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { ArrowRight } from 'lucide-react';

export function VCS() {
  return (
    <div className="min-h-screen bg-portals-bg text-white font-sans selection:bg-portals-primary/30">
      <main className="max-w-[1440px] mx-auto px-6 w-full flex flex-col gap-px bg-portals-surface-variant">
        {/* Hero Section */}
        <section className="bg-portals-bg flex flex-col lg:flex-row pt-0 lg:pt-32 pb-24 min-h-[90vh] relative overflow-hidden">
          <div className="flex-1 flex flex-col justify-end pr-6 md:pr-16 relative z-10 py-12 lg:py-0">
            {/* <StatusPill status="online" label="System status: online" className="w-fit mb-8" /> */}
            <h1 className="text-5xl lg:text-7xl tracking-[-0.04em] leading-[1.1] mb-6">
              Asset-native version control from demo to AAA scale.
            </h1>
            {/* <p className="text-lg text-portals-on-surface-variant max-w-xl mb-12">
              Asset-native version control from demo to AAA scale.
            </p> */}
            <div className="flex items-center gap-4">
              <Button variant="ghost">Read docs</Button>
              <Button className="group -translate-y-[1px] active:translate-y-0">
                Start building
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-50" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 relative min-h-[400px] md:min-h-full p-6">
            {/* Photographic area with overlay card */}
            <div className="absolute inset-0 bg-gradient-to-r from-portals-bg via-transparent to-transparent z-10" />
            <div className="absolute inset-0 bg-portals-surface-lowest opacity-50 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center" />
            
            <div className="absolute bottom-10 items-end right-0 z-20 backdrop-blur-lg bg-portals-surface-lowest/80 p-6 flex flex-col gap-2 w-[240px] md:max-w-[360px]">
              <div className="text-4xl text-portals-secondary flex items-center gap-3">
                0
                <span className="h-2 w-2 rounded-full bg-portals-secondary animate-pulse" />
              </div>
              <div className="text-xs text-portals-on-surface-variant lowercase tracking-widest">Active Workspaces on portals</div>
            </div>

            <div className="absolute -bottom-11 right-6 z-20 grid grid-flow-col gap-x-4 text-xs text-portals-on-surface-variant text-right">
              <div className="pr-4">region: <span className="font-medium">prod-us-east</span></div>
              <div className="pr-4">version: <span className="font-medium">4.2.0-stable</span></div>
              <div className="text-right">latency: <span className="font-medium">12ms</span></div>
            </div>
          </div>
        </section>

         {/* Live stat block */}
          {/* <div className="mt-16 grid grid-cols-2 gap-8 border-t border-portals-surface-variant pt-8">
            <div>
              <div className="text-portals-on-surface-variant text-sm mb-1">Cold storage cost</div>
              <div className="font-mono text-xl text-portals-secondary">$0<span className="text-sm text-portals-on-surface-variant">/gb</span></div>
            </div>
            <div>
              <div className="text-portals-on-surface-variant text-sm mb-1">Objects deduped</div>
              <div className="font-mono text-xl text-portals-secondary">1.2B+</div>
            </div>
          </div> */}

        {/* Features Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-px mt-24 border-t border-b border-portals-surface-variant bg-portals-surface-variant">
          {[
            { title: 'Assets & Code in One History', desc: 'Stop stitching Git and Perforce together. Address code and 8K masters natively in one content-addressable history.', img: 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?q=80&w=800&auto=format&fit=crop', cta: 'Learn more', link: '#' },
            { title: 'Team Collaboration', desc: 'File locking, presence, and merge-conflict notifications handled by a real-time pub/sub-backed service.', img: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop', cta: 'See features', link: '#' },
            { title: 'Tamper-Evident History', desc: 'Objects carry a LAP address and lineage -- a verifiably cryptographically secure history across organizations.', img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop', cta: 'View security', link: '#' },
            { title: 'Full-Surface API', desc: 'Declarative repository manifests. Compose capabilities via contract. Local-dev and staging parity via CLI.', img: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=800&auto=format&fit=crop', cta: 'Read docs', link: '#' },
            // { title: 'Depot storage infrastructure', desc: 'Multi-region active-active depot replication. The control plane tolerates single-region failure without blocking active syncs.', img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop', cta: 'Explore capabilities', link: '#' },
          ].map((pillar, i) => (
            <div key={i} className="bg-portals-bg relative h-[480px] group overflow-hidden flex flex-col justify-end p-8">
              <div className="absolute inset-0 bg-portals-surface-lowest transition-opacity duration-500 opacity-30 group-hover:opacity-50">
                <img src={pillar.img} alt="" className="w-full h-full object-cover grayscale mix-blend-overlay" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-portals-bg via-portals-bg/50 to-transparent" />
              <div className="relative z-10 flex flex-col gap-4">
                <div>
                  <h3 className="text-2xl font-medium mb-2 lowercase">{pillar.title}</h3>
                  <p className="text-portals-on-surface-variant text-sm max-w-sm">{pillar.desc}</p>
                </div>
                <Button variant="outline" className="w-fit justify-between group/button" asChild>
                  <a href={pillar.link}>
                    {pillar.cta}
                    <ArrowRight className="w-4 h-4 group-hover/button:translate-x-1 transition-transform duration-50" />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
