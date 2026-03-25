import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  calcSpeedScore, calcEnduranceScore, calcLongRunScore,
  calcConsistencyScore, calcEfficiencyScore, calcTotalScore
} from '@/lib/scoring'

const STRAVA_API = 'https://www.strava.com/api/v3'

async function getStravaToken(): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Strava token 획득 실패: ' + JSON.stringify(data))
  return data.access_token
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  try {
    // 1. Strava 토큰 획득
    const token = await getStravaToken()

    // 2. 클럽 활동 획득 (Club Activities API)
    const res = await fetch(
      `${STRAVA_API}/clubs/${process.env.STRAVA_CLUB_ID}/activities?per_page=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const activities = await res.json()
    if (!Array.isArray(activities)) throw new Error('Strava 응답 오류: ' + JSON.stringify(activities))

    // 3. 회원 Strava ID 매핑
    const { data: members } = await db.from('members').select('nickname, strava_athlete_id').not('strava_athlete_id', 'is', null)
    const athleteMap = new Map((members || []).map((m: { nickname: string; strava_athlete_id: number }) => [m.strava_athlete_id, m.nickname]))

    // 4. 활동 저장
    let insertCount = 0
    const today = new Date().toISOString().slice(0, 10)

    for (const act of activities) {
      if (act.sport_type !== 'Run' && act.type !== 'Run') continue
      const nickname = athleteMap.get(act.athlete?.id)
      if (!nickname) continue

      const distKm = (act.distance || 0) / 1000
      const movingSec = act.moving_time || 0
      const elapsedSec = act.elapsed_time || movingSec
      const avgPaceSec = distKm > 0 ? Math.round(movingSec / distKm) : 0
      const efficiency = elapsedSec > 0 ? movingSec / elapsedSec : 1

      const { error } = await db.from('activities').upsert({
        member_nickname: nickname,
        athlete_firstname: act.athlete?.firstname,
        athlete_lastname: act.athlete?.lastname,
        date: today,
        distance_km: distKm,
        moving_time_sec: movingSec,
        elapsed_time_sec: elapsedSec,
        avg_pace_sec: avgPaceSec,
        efficiency,
        sport_type: act.sport_type || act.type,
        activity_name: act.name,
      }, { onConflict: 'strava_activity_id', ignoreDuplicates: true })

      if (!error) insertCount++
    }

    // 5. 시즌 점수 재계산
    await recalcSeasonStats(db)

    // 6. 로그 기록
    await db.from('sync_logs').insert({ activity_count: insertCount, status: 'success', message: `Synced ${insertCount} activities` })

    return NextResponse.json({ success: true, synced: insertCount })
  } catch (error) {
    await db.from('sync_logs').insert({ activity_count: 0, status: 'error', message: String(error) })
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

async function recalcSeasonStats(db: ReturnType<typeof createServiceClient>) {
  const { data: season } = await db.from('seasons').select('*').eq('is_current', true).single()
  if (!season) return

  const { data: acts } = await db.from('activities')
    .select('member_nickname, distance_km, avg_pace_sec, moving_time_sec, elapsed_time_sec, date')
    .gte('date', season.start_date)
    .lte('date', season.end_date)
  if (!acts) return

  // 회원별 집계
  const stats: Record<string, { dist: number; longest: number; paceSecs: number[]; days: Set<string>; moving: number; elapsed: number }> = {}
  for (const a of acts) {
    if (!stats[a.member_nickname]) stats[a.member_nickname] = { dist: 0, longest: 0, paceSecs: [], days: new Set(), moving: 0, elapsed: 0 }
    const s = stats[a.member_nickname]
    s.dist += a.distance_km
    s.longest = Math.max(s.longest, a.distance_km)
    if (a.avg_pace_sec > 0) s.paceSecs.push(a.avg_pace_sec)
    s.days.add(a.date)
    s.moving += a.moving_time_sec || 0
    s.elapsed += a.elapsed_time_sec || a.moving_time_sec || 0
  }

  for (const [nick, s] of Object.entries(stats)) {
    const avgPace = s.paceSecs.length > 0 ? Math.round(s.paceSecs.reduce((a, b) => a + b) / s.paceSecs.length) : 0
    const eff = s.elapsed > 0 ? s.moving / s.elapsed : 1
    const daysRun = s.days.size
    const speed = calcSpeedScore(avgPace)
    const endurance = calcEnduranceScore(s.dist)
    const longRun = calcLongRunScore(s.longest)
    const consistency = calcConsistencyScore(daysRun)
    const effScore = calcEfficiencyScore(eff)
    const total = calcTotalScore({ speed, endurance, longRun, consistency, efficiency: effScore })

    await db.from('member_season_stats').upsert({
      member_nickname: nick,
      season_id: season.id,
      distance_km: s.dist,
      longest_run_km: s.longest,
      avg_pace_sec: avgPace,
      days_run: daysRun,
      efficiency: eff,
      endurance_score: endurance,
      speed_score: speed,
      longrun_score: longRun,
      consistency_score: consistency,
      efficiency_score: effScore,
      total_score: total,
    }, { onConflict: 'member_nickname,season_id' })
  }

  // 랜크 업데이트
  const { data: allStats } = await db.from('member_season_stats').select('id').eq('season_id', season.id).order('total_score', { ascending: false })
  if (allStats) {
    for (let i = 0; i < allStats.length; i++) {
      await db.from('member_season_stats').update({ rank: i + 1 }).eq('id', allStats[i].id)
    }
  }
}
