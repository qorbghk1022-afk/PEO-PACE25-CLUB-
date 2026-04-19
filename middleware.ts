import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = ['a5214275@naver.com']

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
const SUPABASE_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? ''
const COOKIE_KEY = `sb-${SUPABASE_REF}-auth-token`

export async function middleware(req: NextRequest) {
  const raw = req.cookies.get(COOKIE_KEY)?.value
  let accessToken: string | null = null
  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw))
      accessToken = typeof parsed?.access_token === 'string' ? parsed.access_token : null
    } catch {
      accessToken = null
    }
  }

  if (!accessToken) return redirect(req, '/login')

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data: { user }, error } = await sb.auth.getUser(accessToken)
  if (error || !user) return redirect(req, '/login')

  if (!ADMIN_EMAILS.includes(user.email ?? '')) return redirect(req, '/')

  return NextResponse.next()
}

function redirect(req: NextRequest, path: string) {
  const url = req.nextUrl.clone()
  url.pathname = path
  if (path === '/login') url.searchParams.set('redirect', req.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*'],
}
