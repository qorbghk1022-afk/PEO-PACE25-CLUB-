import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state')

  if (!code || !userId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/?strava=error`)
  }

  // 환경변수 점검 (로그에 keyMissing만 남김 — 값은 노출 안 함)
  const envCheck = {
    STRAVA_CLIENT_ID: !!process.env.STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET: !!process.env.STRAVA_CLIENT_SECRET,
    STRAVA_CLIENT_ID_len: process.env.STRAVA_CLIENT_ID?.length ?? 0,
    STRAVA_CLIENT_SECRET_len: process.env.STRAVA_CLIENT_SECRET?.length ?? 0,
  }
  console.log('[strava/callback] env check', envCheck)

  // Strava에서 토큰 교환
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    console.error('[strava/callback] token exchange failed', {
      status: tokenRes.status,
      body: tokenData,
      envCheck,
    })
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/?strava=error`)
  }
  console.log('[strava/callback] token exchange OK, athlete_id=', tokenData.athlete?.id)

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // members에 strava_athlete_id 저장
  await admin.from('members').update({
    strava_athlete_id: tokenData.athlete.id,
  }).eq('user_id', userId)

  // strava_tokens 테이블에 토큰 저장 (없으면 생성)
  await admin.from('strava_tokens').upsert({
    user_id: userId,
    athlete_id: tokenData.athlete.id,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
  }, { onConflict: 'user_id' })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/?strava=connected`)
}
