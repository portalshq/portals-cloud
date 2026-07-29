import React from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { ArrowRight } from 'lucide-react';

export function Privacy() {
  return (
    <div className="min-h-screen bg-portals-bg text-white font-sans selection:bg-portals-primary/30">
      <main className="max-w-[1440px] mx-auto px-6 w-full flex flex-col gap-px bg-portals-surface-variant">
        <section className="bg-portals-bg flex flex-col lg:flex-row pt-0 lg:pt-32 pb-24 min-h-[90vh] relative overflow-hidden">
          Privacy Policy (To Be Announced)
          
          {/* What information is collected
          Local repositories and local processing
          When data leaves the user's device
          Authentication data
          Cloud-hosted repositories
          AI provider interactions
          Telemetry (or the absence of telemetry)
          Cookies (website only)
          Data retention
          User rights
          Security
          International transfers
          Children's privacy
          Contact information */}
        </section>
      </main>
    </div>
  );
}
