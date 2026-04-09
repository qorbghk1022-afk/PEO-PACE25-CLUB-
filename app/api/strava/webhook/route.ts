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
import { createServiceClient } from '@/lib/supabase/server'

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
export async function POST(req: NextRequest) {
  try {
    const event = await req.json()
    console.log('[Strava Webhook] Event received:', JSON.stringify(event))

    // Only process activity events
    if (event.object_type !== 'activity') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Handle activity deletion
    if (event.aspect_type === 'delete') {
      const db = createServiceClient()
      const { error: delErr } = await db
        .from('activities')
        .delete()
        .eq('strava_activity_id', event.object_id)
      if (delErr) {
        console.error(`[Strava Webhook] Delete error:`, delErr.message)
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
      console.log(`[Strava Webhook] Deleted activity ${event.object_id}`)
      return NextResponse.json({ ok: true, deleted: event.object_id })
    }

    // Only process activity creation events beyond this point
    if (event.aspect_type !== 'create') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const athleteId: number = event.owner_id
    const activityId: number = event.object_id

    const db = createServiceClient()

    // 1. Look up athlete in strava_tokens
    const { data: tokenRow, error: tokenErr } = await db
      .from('strava_tokens')
      .select('user_id, access_token, refresh_token, expires_at')
      .eq('athlete_id', athleteId)
      .single()

    if (tokenErr || !tokenRow) {
      console.log(`[Strava Webhook] Unknown athlete_id: ${athleteId}`)
      return NextResponse.json({ ok: true, skipped: true, reason: 'unknown_athlete' })
    }

    // 2. Refresh token if expired
    let accessToken = tokenRow.access_token
    const now = Math.floor(Date.now() / 1000)
    if (tokenRow.expires_at <= now) {
      const refreshed = await refreshStravaToken(tokenRow.refresh_token)
      if (!refreshed) {
        console.error(`[Strava Webhook] Token refresh failed for athlete ${athleteId}`)
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 })
      }
      accessToken = refreshed.access_token

      // Save refreshed tokens
      await db.from('strava_tokens').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
      }).eq('athlete_id', athleteId)
    }

    // 3. Fetch activity details from Strava
    const actRes = await fetch(`${STRAVA_API}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!actRes.ok) {
      const errText = await actRes.text()
      console.error(`[Strava Webhook] Activity fetch failed: ${actRes.status} ${errText}`)
      return NextResponse.json({ error: 'Activity fetch failed' }, { status: 500 })
    }

    const activity = await actRes.json()

    // Only process runs
    if (activity.sport_type !== 'Run' && activity.type !== 'Run') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not_a_run' })
    }

    // 4. Look up member nickname
    const { data: member } = await db
      .from('members')
      .select('nickname')
      .eq('strava_athlete_id', athleteId)
      .single()

    if (!member) {
      console.log(`[Strava Webhook] No member found for athlete_id: ${athleteId}`)
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_member' })
    }

    // 5. Insert activity
    const distKm = (activity.distance || 0) / 1000
    const movingSec = activity.moving_time || 0
    const elapsedSec = activity.elapsed_time || movingSec
    const avgPaceSec = distKm > 0 ? Math.round(movingSec / distKm) : 0

    const startDate = activity.start_date_local
      ? activity.start_date_local.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const { error: insertErr } = await db.from('activities').upsert({
      strava_activity_id: activityId,
      member_nickname: member.nickname,
      date: startDate,
      distance_km: distKm,
      moving_time_sec: movingSec,
      elapsed_time_sec: elapsedSec,
      avg_pace_sec: avgPaceSec,
      efficiency: elapsedSec > 0 ? movingSec / elapsedSec : 1,
      sport_type: activity.sport_type || activity.type,
      activity_name: activity.name,
      athlete_firstname: activity.athlete?.firstname,
      athlete_lastname: activity.athlete?.lastname,
    }, { onConflict: 'strava_activity_id' })

    if (insertErr) {
      console.error(`[Strava Webhook] Insert error:`, insertErr.message)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    console.log(`[Strava Webhook] Activity ${activityId} saved for ${member.nickname}`)
    return NextResponse.json({ ok: true, activity_id: activityId, member: member.nickname })
  } catch (err) {
    console.error('[Strava Webhook] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
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
