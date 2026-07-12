import { useState, useEffect } from "react";
import { Link } from "wouter";

const HUD_DATA = [
  { label: "SYS.LOAD", value: "47.2%", status: "ok" },
  { label: "NET.LATENCY", value: "12ms", status: "ok" },
  { label: "ACTIVE_NODES", value: "3,092", status: "ok" },
  { label: "QUEUE", value: "0", status: "ok" },
];

export default function Home() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(now.toISOString().split("T")[1].replace("Z", "") + " UTC");
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative w-full border-b border-border bg-card overflow-hidden">
        {/* Abstract background noise/grid */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMxMzEzMTMiLz48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMjYyNjI2Ii8+PC9zdmc+')] opacity-50 mix-blend-screen pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 py-20 md:py-32 relative z-10 flex flex-col md:flex-row gap-12 items-center">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 border border-border bg-surface-variant px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="font-mono text-xs uppercase text-secondary">Platform Status: Online</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter uppercase leading-[0.9]">
              Build Interactive <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Entertainment</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-xl">
              Portals Cloud is the developer-infrastructure platform for building massive, real-time interactive channels. No servers to manage. Total control.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button className="bg-foreground text-background font-mono text-sm uppercase px-6 py-3 hover:bg-foreground/90 transition-colors border-l border-b border-transparent hover:-translate-y-[2px] active:translate-y-0 active:border-b-0 shadow-[2px_2px_0_hsl(var(--primary))] hover:shadow-[4px_4px_0_hsl(var(--primary))] active:shadow-[0px_0px_0_hsl(var(--primary))]">
                Deploy Now
              </button>
              <Link href="/roadmap" className="bg-transparent text-foreground font-mono text-sm uppercase px-6 py-3 border border-border hover:bg-surface-variant transition-colors flex items-center gap-2">
                View Roadmap
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
              </Link>
            </div>
          </div>

          <div className="w-full md:w-80 flex flex-col gap-px bg-border border border-border">
            <div className="bg-card p-3 border-b border-border flex justify-between items-center">
              <span className="font-mono text-xs text-muted-foreground uppercase">Telemetry</span>
              <span className="font-mono text-xs text-primary uppercase">{time || "00:00:00.000 UTC"}</span>
            </div>
            {HUD_DATA.map((item, i) => (
              <div key={i} className="bg-surface-variant p-4 flex justify-between items-center group hover:bg-muted transition-colors cursor-default">
                <span className="font-mono text-sm text-foreground uppercase">{item.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold">{item.value}</span>
                  <div className={`w-1.5 h-1.5 rounded-none ${item.status === 'ok' ? 'bg-secondary' : 'bg-destructive'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Photographic Pillar Grid */}
      <section className="border-b border-border bg-background py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-12 flex flex-col md:flex-row justify-between items-end gap-4 border-b border-border pb-4">
            <h2 className="text-3xl font-bold uppercase tracking-tight">Connected Audiences</h2>
            <p className="font-mono text-sm text-muted-foreground uppercase max-w-xs text-right">
              Global reach. Microsecond latency. Built for the new era of shared experiences.
            </p>
          </div>
          
          <div className="hairline-grid grid-cols-1 md:grid-cols-3">
            {[
              { img: "audience-home.png", title: "Live Events", desc: "Scale to millions instantly." },
              { img: "group-wide.png", title: "Social Gaming", desc: "Shared state synchronisation." },
              { img: "hands-devices.png", title: "Second Screen", desc: "Real-time interactivity." }
            ].map((pillar, i) => (
              <div key={i} className="hairline-cell flex flex-col border border-transparent hover:border-secondary transition-colors group cursor-crosshair">
                <div className="relative aspect-[4/3] overflow-hidden border-b border-border">
                  <div className="absolute inset-0 bg-primary/20 mix-blend-color z-10 group-hover:bg-transparent transition-colors duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-20" />
                  <img 
                    src={`/src/assets/photography/${pillar.img}`} 
                    alt={pillar.title}
                    className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 scale-105 group-hover:scale-100"
                  />
                  <div className="absolute top-4 left-4 z-30 font-mono text-xs bg-background/80 backdrop-blur border border-border px-2 py-1">
                    USE_CASE_0{i + 1}
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-mono text-lg font-bold uppercase mb-2 group-hover:text-secondary transition-colors">{pillar.title}</h3>
                  <p className="text-muted-foreground text-sm">{pillar.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture / Roadmap Teaser */}
      <section className="py-20 bg-surface-variant relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold uppercase tracking-tight mb-6">Shape The Network</h2>
              <p className="text-lg text-muted-foreground mb-8">
                We are building the infrastructure in the open. Our roadmap is public, and your feedback directly influences what we ship next. Vote on capabilities, suggest features, and track our progress.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4 border border-border bg-background p-4">
                  <div className="w-10 h-10 border border-primary flex items-center justify-center text-primary font-mono bg-primary/10">01</div>
                  <div>
                    <h4 className="font-bold uppercase text-sm">Review Capabilities</h4>
                    <p className="text-xs text-muted-foreground font-mono mt-1">Explore our current architecture proposals.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 border border-border bg-background p-4">
                  <div className="w-10 h-10 border border-secondary flex items-center justify-center text-secondary font-mono bg-secondary/10">02</div>
                  <div>
                    <h4 className="font-bold uppercase text-sm">Cast Your Vote</h4>
                    <p className="text-xs text-muted-foreground font-mono mt-1">Influence resource allocation.</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <Link href="/roadmap" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-mono text-sm uppercase px-6 py-3 hover:bg-primary/90 transition-colors border-l border-b border-border border-b-[2px] active:border-b hover:-translate-y-[1px] active:translate-y-0">
                  Open Service Catalog
                </Link>
              </div>
            </div>
            
            <div className="relative">
              {/* Abstract Architecture Diagram */}
              <div className="border border-border bg-background p-8 font-mono text-xs">
                <div className="border border-muted p-4 mb-4 relative">
                  <div className="absolute -top-3 left-4 bg-background px-2 text-muted-foreground uppercase">Client Layer</div>
                  <div className="flex justify-between gap-4">
                    <div className="flex-1 bg-surface-variant h-12 flex items-center justify-center border border-border">Web</div>
                    <div className="flex-1 bg-surface-variant h-12 flex items-center justify-center border border-border">Mobile</div>
                    <div className="flex-1 bg-surface-variant h-12 flex items-center justify-center border border-border">Console</div>
                  </div>
                </div>
                
                <div className="flex justify-center my-2 text-secondary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                </div>
                
                <div className="border border-primary/50 p-4 mb-4 relative bg-primary/5">
                  <div className="absolute -top-3 left-4 bg-background px-2 text-primary uppercase">Portals Edge</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background h-16 flex flex-col items-center justify-center border border-primary/30">
                      <span>Gateway</span>
                      <span className="text-[10px] text-muted-foreground">WSS / TCP</span>
                    </div>
                    <div className="bg-background h-16 flex flex-col items-center justify-center border border-primary/30">
                      <span>State Sync</span>
                      <span className="text-[10px] text-muted-foreground">CRDTs</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center my-2 text-secondary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                </div>
                
                <div className="border border-muted p-4 relative">
                  <div className="absolute -top-3 left-4 bg-background px-2 text-muted-foreground uppercase">Persistence</div>
                  <div className="flex gap-4">
                    <div className="w-1/3 bg-surface-variant h-12 flex items-center justify-center border border-border">KV</div>
                    <div className="flex-1 bg-surface-variant h-12 flex items-center justify-center border border-border">Event Log</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
