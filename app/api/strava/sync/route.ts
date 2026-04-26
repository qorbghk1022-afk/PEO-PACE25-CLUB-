/**
 * POST /api/strava/sync
 * 개인 OAuth 토큰으로 각 사용자의 활동을 sync
 *
 * - strava_tokens 테이블의 모든 사용자 순회
 * - 만료된 access_token은 refresh_token으로 갱신
 * - /athlete/activities?after=... 로 최근 활동 fetch
 * - start_date_local 기반 정확한 날짜 + strava_activity_id로 dedup
 *
 * 안전망: webhook이 놓친 활동을 매일 한 번씩 catch-up
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const STRAVA_API = 'https://www.strava.com/api/v3'
const LOOKBACK_DAYS = 7  // 최근 7일치 활동을 매일 fetch

interface StravaToken {
  user_id: string
  athlete_id: number
  access_token: string
  refresh_token: string
  expires_at: number
}

interface StravaActivity {
  id: number
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  start_date_local: string
  sport_type: string
  type: string
  athlete?: { firstname?: string; lastname?: string }
}

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
    console.error('[strava/sync] token refresh failed:', JSON.stringify(data))
    return null
  }
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: data.expires_at as number,
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  try {
    const { data: tokens } = await db.from('strava_tokens')
      .select('user_id, athlete_id, access_token, refresh_token, expires_at')
    const tokenList = (tokens || []) as StravaToken[]
    if (tokenList.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'no connected athletes' })
    }

    // athlete_id → nickname 매핑 (멀티크루 멤버는 첫 row 사용 — 어차피 같은 닉)
    const { data: members } = await db.from('members')
      .select('nickname, strava_athlete_id').not('strava_athlete_id', 'is', null)
    const nickByAthlete = new Map<number, string>()
    for (const m of (members || []) as Array<{ nickname: string; strava_athlete_id: number }>) {
      if (!nickByAthlete.has(m.strava_athlete_id)) nickByAthlete.set(m.strava_athlete_id, m.nickname)
    }

    const after = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 24 * 3600
    let totalInserted = 0
    let totalSkipped = 0
    const perUser: Array<{ nickname: string; inserted: number; error?: string }> = []

    for (const t of tokenList) {
      const nickname = nickByAthlete.get(t.athlete_id)
      if (!nickname) {
        perUser.push({ nickname: `athlete_${t.athlete_id}`, inserted: 0, error: 'no_member_nickname' })
        continue
      }

      // 1. 토큰 만료 체크 + 갱신
      let accessToken = t.access_token
      const now = Math.floor(Date.now() / 1000)
      if (t.expires_at <= now + 60) {  // 만료 1분 이내도 갱신
        const refreshed = await refreshStravaToken(t.refresh_token)
        if (!refreshed) {
          perUser.push({ nickname, inserted: 0, error: 'token_refresh_failed' })
          continue
        }
        accessToken = refreshed.access_token
        await db.from('strava_tokens').update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
        }).eq('user_id', t.user_id)
      }

      // 2. 최근 활동 fetch
      const url = `${STRAVA_API}/athlete/activities?after=${after}&per_page=30`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) {
        const txt = await res.text()
        console.error(`[strava/sync] ${nickname} fetch failed:`, res.status, txt)
        perUser.push({ nickname, inserted: 0, error: `fetch_${res.status}` })
        continue
      }
      const acts = (await res.json()) as StravaActivity[]
      if (!Array.isArray(acts)) {
        perUser.push({ nickname, inserted: 0, error: 'bad_response' })
        continue
      }

      // 3. Run만 필터링 + upsert
      let userInserted = 0
      for (const act of acts) {
        if (act.sport_type !== 'Run' && act.type !== 'Run') continue
        const distKm = (act.distance || 0) / 1000
        const movingSec = act.moving_time || 0
        const elapsedSec = act.elapsed_time || movingSec
        const avgPaceSec = distKm > 0 ? Math.round(movingSec / distKm) : 0
        const date = act.start_date_local?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)

        const { error } = await db.from('activities').upsert({
          strava_activity_id: act.id,
          member_nickname: nickname,
          date,
          distance_km: distKm,
          moving_time_sec: movingSec,
          elapsed_time_sec: elapsedSec,
          avg_pace_sec: avgPaceSec,
          efficiency: elapsedSec > 0 ? movingSec / elapsedSec : 1,
          sport_type: act.sport_type || act.type,
          activity_name: act.name,
          athlete_firstname: act.athlete?.firstname,
          athlete_lastname: act.athlete?.lastname,
          crew_id: null,  // Strava 활동은 모든 소속 크루 카운트
        }, { onConflict: 'strava_activity_id', ignoreDuplicates: false })

        if (error) {
          console.error(`[strava/sync] ${nickname} upsert error:`, error.message)
        } else {
          userInserted++
          totalInserted++
        }
      }
      totalSkipped += acts.length - userInserted
      perUser.push({ nickname, inserted: userInserted })
    }

    await db.from('sync_logs').insert({
      activity_count: totalInserted,
      status: 'success',
      message: `[strava] ${tokenList.length} users, ${totalInserted} upserted, ${totalSkipped} skipped`,
    })

    return NextResponse.json({
      success: true,
      synced: totalInserted,
      users: tokenList.length,
      perUser,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await db.from('sync_logs').insert({ activity_count: 0, status: 'error', message: `[strava] ${msg}` })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
