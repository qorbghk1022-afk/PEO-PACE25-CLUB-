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

export const maxDuration = 300

const STRAVA_API = 'https://www.strava.com/api/v3'
const LOOKBACK_DAYS = 2  // webhook 누락 catch-up용. 7→2로 축소 (API 호출량/처리 시간 ↓)
const CONCURRENCY = 5    // Strava rate limit (100/15min) 안 넘는 동시 처리 한도
const ACCEPTED_RUN_TYPES = ['Run', 'TrailRun', 'TreadmillRun']  // VirtualRun은 제외

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

    // ─── 한 사용자 처리 (병렬 워커가 호출) ─────────────
    type UserResult = { nickname: string; inserted: number; skipped: number; error?: string }
    const processUser = async (t: StravaToken): Promise<UserResult> => {
      const nickname = nickByAthlete.get(t.athlete_id)
      if (!nickname) return { nickname: `athlete_${t.athlete_id}`, inserted: 0, skipped: 0, error: 'no_member_nickname' }

      // 1. 토큰 만료 체크 + 갱신
      let accessToken = t.access_token
      const now = Math.floor(Date.now() / 1000)
      if (t.expires_at <= now + 60) {
        const refreshed = await refreshStravaToken(t.refresh_token)
        if (!refreshed) return { nickname, inserted: 0, skipped: 0, error: 'token_refresh_failed' }
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
        console.error(`[strava/sync] ${nickname} fetch failed:`, res.status)
        return { nickname, inserted: 0, skipped: 0, error: `fetch_${res.status}` }
      }
      const acts = (await res.json()) as StravaActivity[]
      if (!Array.isArray(acts)) return { nickname, inserted: 0, skipped: 0, error: 'bad_response' }

      // 3. Run/TrailRun/TreadmillRun 필터링 + 병렬 upsert
      const runActs = acts.filter(a => ACCEPTED_RUN_TYPES.includes(a.sport_type) || ACCEPTED_RUN_TYPES.includes(a.type))
      const upsertResults = await Promise.all(runActs.map(async act => {
        const distKm = (act.distance || 0) / 1000
        const movingSec = act.moving_time || 0
        const elapsedSec = act.elapsed_time || movingSec
        const avgPaceSec = distKm > 0 ? Math.round(movingSec / distKm) : 0
        const date = act.start_date_local?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
        const { error } = await db.from('activities').upsert({
          strava_activity_id: act.id, member_nickname: nickname, date,
          distance_km: distKm, moving_time_sec: movingSec, elapsed_time_sec: elapsedSec,
          avg_pace_sec: avgPaceSec, efficiency: elapsedSec > 0 ? movingSec / elapsedSec : 1,
          sport_type: act.sport_type || act.type, activity_name: act.name,
          athlete_firstname: act.athlete?.firstname, athlete_lastname: act.athlete?.lastname,
          crew_id: null,
        }, { onConflict: 'strava_activity_id', ignoreDuplicates: false })
        if (error) console.error(`[strava/sync] ${nickname} upsert error:`, error.message)
        return !error
      }))
      const userInserted = upsertResults.filter(Boolean).length
      return { nickname, inserted: userInserted, skipped: acts.length - userInserted }
    }

    // ─── 동시성 제한 워커 풀 ─────────────────────────────
    const perUser: UserResult[] = new Array(tokenList.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < tokenList.length) {
        const i = cursor++
        perUser[i] = await processUser(tokenList[i])
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokenList.length) }, worker))

    const totalInserted = perUser.reduce((s, r) => s + r.inserted, 0)
    const totalSkipped = perUser.reduce((s, r) => s + r.skipped, 0)

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
