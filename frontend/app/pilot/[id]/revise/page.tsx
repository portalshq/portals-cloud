import type {Metadata} from 'next'
import {PilotScopeForm} from '@/components/leads/PilotScopeForm'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {resolveRoomAccess} from '@/lib/leads/room-access'
import {getPilotById} from '@/lib/leads/store'

export const metadata: Metadata = {
  title: 'Revise Your Pilot Plan',
  description: 'Update your pilot scope and resubmit for review.',
}

export const dynamic = 'force-dynamic'

export default async function PilotRevisePage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<{t?: string}>
}) {
  const [{id}, query] = await Promise.all([params, searchParams])
  const pilot = await getPilotById(id)
  const access = await resolveRoomAccess(pilot, query.t)

  if (!pilot) {
    return (
      <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
        <div className="mx-auto max-w-3xl px-24 py-40">
          <h1 className="t-h1-sans">this pilot record could not be found.</h1>
        </div>
      </main>
    )
  }
  if (!access) {
    return (
      <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
        <div className="mx-auto max-w-3xl px-24 py-40">
          <h1 className="t-h1-sans">this link needs verification.</h1>
          <p className="mt-16 t-p-lg-serif text-white">
            open the revise link from your pilot email to continue.
          </p>
        </div>
      </main>
    )
  }
  const context = await getKnownLeadContext()

  return (
    <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
      <section className="mx-auto w-full max-w-3xl px-24 py-24 md:py-40">
        <p className="t-p-sans text-white">revise your pilot plan</p>
        <h1 className="mt-16 t-d2-sans">
          update the scope, then resubmit for review
        </h1>
        <p className="mt-24 max-w-[36em] t-p-lg-serif text-white">
          your previous answers are loaded below. change what changed, then
          submit. the plan re-classifies against the standard package boundary.
        </p>
        <div className="mt-32">
          <PilotScopeForm
            specSummary=""
            context={context}
            pilotId={pilot.id}
            initialAnswers={pilot.answers as Record<string, unknown>}
          />
        </div>
      </section>
    </main>
  )
}
