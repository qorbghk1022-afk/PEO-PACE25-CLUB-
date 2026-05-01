import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { QUARTERS, quarterStatus } from '@/lib/quarters'

export const maxDuration = 60

const STRAVA_API = 'https://www.strava.com/api/v3'
const ACCEPTED_RUN_TYPES = ['Run', 'TrailRun', 'TreadmillRun']

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
  const { error: memErr } = await admin.from('members').update({
    strava_athlete_id: tokenData.athlete.id,
  }).eq('user_id', userId)
  if (memErr) console.error('[strava/callback] members update error:', memErr)

  // strava_tokens 테이블에 토큰 저장 (없으면 생성)
  const { error: tokErr } = await admin.from('strava_tokens').upsert({
    user_id: userId,
    athlete_id: tokenData.athlete.id,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
  }, { onConflict: 'user_id' })
  if (tokErr) console.error('[strava/callback] strava_tokens upsert error:', tokErr, {
    user_id: userId,
    athlete_id: tokenData.athlete.id,
    expires_at_type: typeof tokenData.expires_at,
    expires_at_value: tokenData.expires_at,
    has_access_token: !!tokenData.access_token,
    has_refresh_token: !!tokenData.refresh_token,
  })
  else console.log('[strava/callback] strava_tokens upsert OK for user', userId)

  // ─── 초기 sync — 현재 분기 시작일부터 활동 백필 (webhook은 이후만 잡으므로) ───
  try {
    // 회원의 닉네임 조회 (멀티크루는 첫 row)
    const { data: memRows } = await admin.from('members').select('nickname').eq('user_id', userId).limit(1)
    const nickname = memRows?.[0]?.nickname
    if (nickname) {
      const activeQ = QUARTERS.find(q => quarterStatus(q) === 'active') || QUARTERS[0]
      const after = Math.floor(new Date(activeQ.start + 'T00:00:00+09:00').getTime() / 1000)
      const url = `${STRAVA_API}/athlete/activities?after=${after}&per_page=100`
      const actsRes = await fetch(url, { headers: { Authorization: `Bearer ${tokenData.access_token}` } })
      if (actsRes.ok) {
        const acts = await actsRes.json() as Array<{
          id: number; start_date_local: string; type: string; sport_type: string;
          distance: number; moving_time: number; elapsed_time: number; name: string;
          athlete?: { firstname?: string; lastname?: string }
        }>
        let inserted = 0
        for (const a of acts) {
          if (!ACCEPTED_RUN_TYPES.includes(a.sport_type) && !ACCEPTED_RUN_TYPES.includes(a.type)) continue
          const distKm = (a.distance || 0) / 1000
          const movingSec = a.moving_time || 0
          const elapsedSec = a.elapsed_time || movingSec
          const { error } = await admin.from('activities').upsert({
            strava_activity_id: a.id, member_nickname: nickname,
            date: a.start_date_local.slice(0, 10),
            distance_km: distKm, moving_time_sec: movingSec, elapsed_time_sec: elapsedSec,
            avg_pace_sec: distKm > 0 ? Math.round(movingSec / distKm) : 0,
            efficiency: elapsedSec > 0 ? movingSec / elapsedSec : 1,
            sport_type: a.sport_type || a.type, activity_name: a.name,
            athlete_firstname: a.athlete?.firstname, athlete_lastname: a.athlete?.lastname,
            crew_id: null,
          }, { onConflict: 'strava_activity_id', ignoreDuplicates: false })
          if (!error) inserted++
        }
        console.log(`[strava/callback] initial sync OK: ${nickname} ${inserted} activities since ${activeQ.start}`)
      } else {
        console.error(`[strava/callback] initial sync fetch failed: ${actsRes.status}`)
      }
    }
  } catch (e) {
    console.error('[strava/callback] initial sync error:', e)
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/?strava=connected`)
}
