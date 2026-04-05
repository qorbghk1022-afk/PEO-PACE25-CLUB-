/**
 * POST /api/recalc  (Authorization 필요)
 * GET  /api/recalc  (임시 — 계산 완료 후 삭제 예정)
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  calcSpeedScore, calcEnduranceScore, calcLongRunScore,
  calcConsistencyScore, calcEfficiencyScore, calcTotalScore, calcLv
} from '@/lib/scoring'

async function runRecalc() {
  const db = createServiceClient()

  const { data: season } = await db.from('seasons').select('*').eq('is_current', true).single()
  if (!season) throw new Error('시즌 없음')

  const { data: acts } = await db.from('activities')
    .select('member_nickname, distance_km, avg_pace_sec, moving_time_sec, elapsed_time_sec, date')
    .gte('date', season.start_date)
    .lte('date', season.end_date)

  const stats: Record<string, { dist: number; longest: number; paceSecs: number[]; days: Set<string>; moving: number; elapsed: number }> = {}
  for (const a of (acts || [])) {
    if (!stats[a.member_nickname]) stats[a.member_nickname] = { dist: 0, longest: 0, paceSecs: [], days: new Set(), moving: 0, elapsed: 0 }
    const s = stats[a.member_nickname]
    s.dist += a.distance_km
    s.longest = Math.max(s.longest, a.distance_km)
    if (a.avg_pace_sec > 0) s.paceSecs.push(a.avg_pace_sec)
    s.days.add(a.date)
    s.moving += a.moving_time_sec || 0
    s.elapsed += a.elapsed_time_sec || a.moving_time_sec || 0
  }

  let updated = 0
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
      member_nickname: nick, season_id: season.id,
      distance_km: s.dist, longest_run_km: s.longest, avg_pace_sec: avgPace,
      days_run: daysRun, efficiency: eff,
      endurance_score: endurance, speed_score: speed, longrun_score: longRun,
      consistency_score: consistency, efficiency_score: effScore, total_score: total,
    }, { onConflict: 'member_nickname,season_id' })

    const { data: allActs } = await db.from('activities').select('distance_km, avg_pace_sec, date').eq('member_nickname', nick)
    const totalDist = (allActs || []).reduce((sum: number, a: { distance_km: number }) => sum + a.distance_km, 0)
    const totalDays = new Set((allActs || []).map((a: { date: string }) => a.date)).size

    // LV: 누적 km × 페이스계수 기반 (챌린지 점수와 분리)
    const paceSecs = (allActs || []).filter((a: { avg_pace_sec: number }) => a.avg_pace_sec > 0).map((a: { avg_pace_sec: number }) => a.avg_pace_sec)
    const cumAvgPace = paceSecs.length > 0 ? Math.round(paceSecs.reduce((a: number, b: number) => a + b, 0) / paceSecs.length) : 0
    const lv = calcLv(totalDist, cumAvgPace)

    await db.from('members').update({ total_dist: totalDist, total_days: totalDays, lv }).eq('nickname', nick)
    updated++
  }

  const { data: allStats } = await db.from('member_season_stats').select('id').eq('season_id', season.id).order('total_score', { ascending: false })
  if (allStats) {
    for (let i = 0; i < allStats.length; i++) {
      await db.from('member_season_stats').update({ rank: i + 1 }).eq('id', allStats[i].id)
    }
  }

  return updated
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const updated = await runRecalc()
    return NextResponse.json({ success: true, updated, message: `${updated}명 점수 재계산 완료` })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const updated = await runRecalc()
    return NextResponse.json({ success: true, updated, message: `${updated}명 점수 재계산 완료` })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
