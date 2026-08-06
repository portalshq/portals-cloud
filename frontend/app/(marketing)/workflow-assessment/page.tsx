import type {Metadata} from 'next'
import {TallyAssessment} from '@/components/leads/TallyAssessment'
import {getKnownLeadContext} from '@/lib/leads/profile'

export const metadata: Metadata = {
  title: 'Assess Your AI Production Workflow | Portals',
  description: 'Assess production fit, production-memory pain, and readiness for a Portals workflow review or paid pilot.',
}

export const dynamic = 'force-dynamic'

export default async function WorkflowAssessmentPage() {
  const context = await getKnownLeadContext(true)
  return (
    <main className="relative z-(--z-main) min-h-screen bg-[#101010] text-white">
      <section data-header-theme="light" className="ui-grid min-h-[72vh] items-end pb-40 pt-Header-h">
        <div className="col-span-full max-w-[980px] py-48">
          <h1 className="mt-20 max-w-[11em] t-d2-sans">Assess your production workflow.</h1>
          <p className="mt-24 max-w-[38em] t-p-lg-serif text-white">
            Identify whether production fit, recurring loss, and near-term intent justify a workflow review or paid pilot.
          </p>
        </div>
      </section>
      <section data-header-theme="light" className="ui-grid py-fluid-[76,106]">
        <div className="col-span-full max-w-[860px]">
          <TallyAssessment context={context} />
        </div>
      </section>
    </main>
  )
}
