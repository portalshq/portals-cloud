import React from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { ArrowRight } from 'lucide-react';

export function TermsOfService() {
  return (
    <div className="min-h-screen bg-portals-bg text-white font-sans selection:bg-portals-primary/30">
      <main className="max-w-[1440px] mx-auto px-6 w-full flex flex-col gap-px bg-portals-surface-variant">
        <section className="bg-portals-bg flex flex-col lg:flex-row pt-0 lg:pt-32 pb-24 min-h-[90vh] relative overflow-hidden">
          Terms of Service (To Be Announced)

          {/* Use of the Services
          Accounts
          Repository ownership
          Intellectual property
          User-generated content
          Cloud hosting
          AI-generated outputs
          Acceptable use
          Availability
          Third-party services
          Fees
          Termination
          Warranty disclaimer
          Limitation of liability
          Governing law */}
        </section>
      </main>
    </div>
  );
}
