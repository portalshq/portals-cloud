import type {Metadata} from 'next'
import {inspectMagicLink} from '@/lib/leads/application-auth'

export const metadata: Metadata = {
  title: 'Review Link Expired',
}

export const dynamic = 'force-dynamic'

export default async function RecoverReviewLinkPage({
  searchParams,
}: {
  searchParams: Promise<{token?: string; sent?: string}>
}) {
  const query = await searchParams
  const token = query.token || ''
  const link = token ? await inspectMagicLink(token) : null
  const sent = query.sent === '1'

  return (
    <main className="min-h-screen bg-white px-24 py-32 text-[#07112C]">
      <section className="mx-auto max-w-[34rem] border-t border-[#D9E1EC] pt-20">
        <p className="t-p-sm-sans text-[#52617D]">portals paid pilot review</p>
        <h1 className="mt-8 t-h2-sans">this review link has expired.</h1>
        {link ? (
          <>
            <p className="mt-16 t-p-sans text-[#52617D]">
              Send a new secure link to {link.user.email}. It will open the same review room directly.
            </p>
            {sent ? (
              <p className="mt-16 t-p-sm-sans text-[#2F66B5]" role="status">
                A new secure link was sent.
              </p>
            ) : (
              <form className="mt-20" method="post" action="/api/auth/reissue-link">
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="inline-flex h-48 items-center justify-center rounded border border-[#07112C] bg-[#07112C] px-16 t-p-sm-sans text-white transition-colors hover:bg-[#2F66B5]"
                >
                  Send a new secure link
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="mt-16 t-p-sans text-[#52617D]">
            The link is invalid or no longer available. Reply to the email that brought you here and we will help.
          </p>
        )}
      </section>
    </main>
  )
}
