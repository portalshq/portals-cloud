import {NextResponse} from 'next/server'
import {
  APP_SESSION_COOKIE,
  APP_SESSION_MAX_AGE_SECONDS,
  consumeMagicLink,
} from '@/lib/leads/application-auth'

export const runtime = 'nodejs'

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account'
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.redirect(new URL('/auth/sign-in?error=invalid', url))
  const result = await consumeMagicLink(token)
  if (!result) return NextResponse.redirect(new URL('/auth/sign-in?error=expired', url))
  const response = NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url))
  response.cookies.set(APP_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: APP_SESSION_MAX_AGE_SECONDS,
  })
  return response
}
