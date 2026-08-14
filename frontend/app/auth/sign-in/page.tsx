'use client'

import {useSearchParams} from 'next/navigation'
import {Suspense, useState} from 'react'

function SignInPage() {
  const search = useSearchParams()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({email, next: search.get('next') || '/account'}),
      })
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-24 py-40">
      <form className="w-full rounded border border-[#D9E1EC] p-24" onSubmit={submit}>
        <h1 className="t-h3-sans">sign in to your portals account</h1>
        <p className="mt-8 t-p-sm-sans text-[#52617D]">we’ll send a one-time sign-in link to your email.</p>
        <label className="mt-20 block t-p-sm-sans" htmlFor="email">work email</label>
        <input
          className="mt-6 w-full rounded border border-[#AEB9CA] px-12 py-10"
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className="mt-16 rounded bg-[#07112C] px-16 py-10 text-white" disabled={busy} type="submit">
          {busy ? 'sending…' : 'email me a sign-in link'}
        </button>
        {sent ? <p className="mt-12 t-p-sm-sans text-[#2F66B5]">if an account exists for that email, a sign-in link is on its way.</p> : null}
        {search.get('error') ? <p className="mt-12 t-p-sm-sans text-[#B3261E]">that sign-in link is invalid or has expired. request a new one.</p> : null}
      </form>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignInPage />
    </Suspense>
  )
}
