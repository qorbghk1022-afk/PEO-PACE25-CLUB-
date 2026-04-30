/**
 * Strava Webhook Endpoint
 *
 * GET  /api/strava/webhook — Webhook verification (hub.challenge)
 * POST /api/strava/webhook — Receive activity events from Strava
 *
 * When a new activity is created:
 *  1. Look up athlete_id in strava_tokens
 *  2. Refresh token if expired
 *  3. Fetch activity details from Strava API
 *  4. Insert into activities table
 */
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

const STRAVA_API = 'https://www.strava.com/api/v3'

// ─── GET: Webhook verification ───────────────────────────
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.STRAVA_VERIFY_TOKEN) {
    console.log('[Strava Webhook] Verification successful')
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── POST: Activity event handler ────────────────────────
// Strava는 webhook 응답을 2초 내 요구. 무거운 처리(토큰 refresh + Strava API + DB)는
// after()로 응답 이후 백그라운드 실행 → 즉시 200 반환.
export async function POST(req: NextRequest) {
  try {
    const event = await req.json()
    console.log('[Strava Webhook] Event received:', JSON.stringify(event))

    if (event.object_type !== 'activity') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // 즉시 200 반환 → 처리는 백그라운드에서
    after(async () => {
      try {
        await processStravaEvent(event)
      } catch (err) {
        console.error('[Strava Webhook] Background error:', err)
      }
    })

    return NextResponse.json({ ok: true, queued: true })
  } catch (err) {
    console.error('[Strava Webhook] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function processStravaEvent(event: {
  object_type: string; aspect_type: string; object_id: number; owner_id: number;
}) {
  const db = createServiceClient()

  if (event.aspect_type === 'delete') {
    const { error } = await db.from('activities').delete().eq('strava_activity_id', event.object_id)
    if (error) console.error('[Strava Webhook] Delete error:', error.message)
    else console.log(`[Strava Webhook] Deleted activity ${event.object_id}`)
    return
  }

  if (event.aspect_type !== 'create') return

  const athleteId = event.owner_id
  const activityId = event.object_id

  // 1. tokens 조회
  const { data: tokenRow, error: tokenErr } = await db
    .from('strava_tokens')
    .select('user_id, access_token, refresh_token, expires_at')
    .eq('athlete_id', athleteId)
    .single()
  if (tokenErr || !tokenRow) {
    console.log(`[Strava Webhook] Unknown athlete_id: ${athleteId}`)
    return
  }

  // 2. 토큰 refresh
  let accessToken = tokenRow.access_token
  const now = Math.floor(Date.now() / 1000)
  if (tokenRow.expires_at <= now) {
    const refreshed = await refreshStravaToken(tokenRow.refresh_token)
    if (!refreshed) {
      console.error(`[Strava Webhook] Token refresh failed for athlete ${athleteId}`)
      return
    }
    accessToken = refreshed.access_token
    await db.from('strava_tokens').update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
    }).eq('athlete_id', athleteId)
  }

  // 3. 활동 상세 fetch
  const actRes = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!actRes.ok) {
    console.error(`[Strava Webhook] Activity fetch failed: ${actRes.status}`)
    return
  }
  const activity = await actRes.json()

  const ACCEPTED_RUN_TYPES = ['Run', 'TrailRun', 'TreadmillRun']
  if (!ACCEPTED_RUN_TYPES.includes(activity.sport_type) && !ACCEPTED_RUN_TYPES.includes(activity.type)) return

  // 4. member nickname
  const { data: member } = await db.from('members')
    .select('nickname').eq('strava_athlete_id', athleteId).single()
  if (!member) {
    console.log(`[Strava Webhook] No member for athlete_id: ${athleteId}`)
    return
  }

  // 5. upsert
  const distKm = (activity.distance || 0) / 1000
  const movingSec = activity.moving_time || 0
  const elapsedSec = activity.elapsed_time || movingSec
  const avgPaceSec = distKm > 0 ? Math.round(movingSec / distKm) : 0
  const startDate = activity.start_date_local
    ? activity.start_date_local.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const { error: insertErr } = await db.from('activities').upsert({
    strava_activity_id: activityId, member_nickname: member.nickname, date: startDate,
    distance_km: distKm, moving_time_sec: movingSec, elapsed_time_sec: elapsedSec,
    avg_pace_sec: avgPaceSec, efficiency: elapsedSec > 0 ? movingSec / elapsedSec : 1,
    sport_type: activity.sport_type || activity.type, activity_name: activity.name,
    athlete_firstname: activity.athlete?.firstname, athlete_lastname: activity.athlete?.lastname,
    crew_id: null,
  }, { onConflict: 'strava_activity_id' })

  if (insertErr) console.error('[Strava Webhook] Insert error:', insertErr.message)
  else console.log(`[Strava Webhook] Activity ${activityId} saved for ${member.nickname}`)
}

// ─── Helper: Refresh Strava token ────────────────────────
async function refreshStravaToken(refreshToken: string) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    console.error('[Strava Webhook] Token refresh response:', JSON.stringify(data))
    return null
  }

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: data.expires_at as number,
  }
}
