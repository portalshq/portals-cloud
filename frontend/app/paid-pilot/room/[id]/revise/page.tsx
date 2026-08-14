import type {Metadata} from 'next'
import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {PilotScopeForm} from '@/components/leads/PilotScopeForm'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {APP_SESSION_COOKIE, currentApplicationUser, pilotMembershipRole} from '@/lib/leads/application-auth'
import {getPilotById} from '@/lib/leads/store'

export const metadata: Metadata = {
  title: 'Revise Your Pilot Plan',
  description: 'Update your pilot scope and resubmit for review.',
}

export const dynamic = 'force-dynamic'

export default async function PilotRevisePage({
  params,
}: {
  params: Promise<{id: string}>
}) {
  const {id} = await params
  const pilot = await getPilotById(id)

  if (!pilot) {
    return (
      <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
        <div className="mx-auto max-w-3xl px-24 py-40">
          <h1 className="t-h1-sans">this content could not be found.</h1>
            <p className="mt-16 t-p-sans">
              if you expected it to exist,
              reply to the email that brought you here.
            </p>
        </div>
      </main>
    )
  }
  const user = await currentApplicationUser((await cookies()).get(APP_SESSION_COOKIE)?.value)
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/paid-pilot/room/${id}/revise`)}`)
  const role = await pilotMembershipRole(pilot.id, user.id)
  if (role !== 'owner') {
    return (
      <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
        <div className="mx-auto max-w-3xl px-24 py-40">
          <h1 className="t-h1-sans">this content could not be found.</h1>
            <p className="mt-16 t-p-sans">
              if you expected it to exist,
              reply to the email that brought you here.
            </p>
        </div>
      </main>
    )
  }
  const context = await getKnownLeadContext()

  return (
    <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
      <section className="mx-auto w-full max-w-3xl py-24 md:py-40">
        <h1 className="t-h3-sans px-52">
          revise your pilot plan
        </h1>
        <p className="mt-24 px-52 t-p-sm-sans text-white">update the scope, submit for review</p>
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
