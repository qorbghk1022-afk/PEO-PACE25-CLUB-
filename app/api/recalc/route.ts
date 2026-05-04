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

export const maxDuration = 300

async function runRecalc() {
  const db = createServiceClient()

  // 멀티크루 대응: 현재 진행 중인 모든 시즌 처리
  const { data: seasons } = await db.from('seasons').select('*').eq('is_current', true)
  if (!seasons || seasons.length === 0) throw new Error('시즌 없음')

  let updated = 0
  for (const season of seasons) {
    const { data: acts } = await db.from('activities')
      .select('member_nickname, distance_km, avg_pace_sec, moving_time_sec, elapsed_time_sec, date, crew_id')
      .gte('date', season.start_date).lte('date', season.end_date)
      .or(`crew_id.eq.${season.crew_id},crew_id.is.null`)

    // 시즌 멤버 (해당 크루)
    const { data: crewMems } = await db.from('members')
      .select('nickname').eq('crew_id', season.crew_id).eq('is_active', true)
    const crewNicks = new Set((crewMems || []).map(m => m.nickname))

    const stats: Record<string, { dist: number; longest: number; paceSecs: number[]; days: Set<string>; moving: number; elapsed: number }> = {}
    for (const a of (acts || [])) {
      if (!crewNicks.has(a.member_nickname)) continue
      if (!stats[a.member_nickname]) stats[a.member_nickname] = { dist: 0, longest: 0, paceSecs: [], days: new Set(), moving: 0, elapsed: 0 }
      const s = stats[a.member_nickname]
      s.dist += Number(a.distance_km)
      s.longest = Math.max(s.longest, Number(a.distance_km))
      if (Number(a.avg_pace_sec) > 0) s.paceSecs.push(Number(a.avg_pace_sec))
      s.days.add(a.date)
      s.moving += Number(a.moving_time_sec) || 0
      s.elapsed += Number(a.elapsed_time_sec) || Number(a.moving_time_sec) || 0
    }

    for (const [nick, s] of Object.entries(stats)) {
      const avgPace = s.paceSecs.length > 0 ? Math.round(s.paceSecs.reduce((a, b) => a + b) / s.paceSecs.length) : 0
      const eff = s.elapsed > 0 ? s.moving / s.elapsed : 1
      const daysRun = s.days.size
      const total = calcTotalScore({
        speed: calcSpeedScore(avgPace), endurance: calcEnduranceScore(s.dist),
        longRun: calcLongRunScore(s.longest), consistency: calcConsistencyScore(daysRun),
        efficiency: calcEfficiencyScore(eff),
      })

      await db.from('member_season_stats').upsert({
        member_nickname: nick, season_id: season.id,
        distance_km: s.dist, longest_run_km: s.longest, avg_pace_sec: avgPace,
        days_run: daysRun, efficiency: eff,
        endurance_score: calcEnduranceScore(s.dist), speed_score: calcSpeedScore(avgPace),
        longrun_score: calcLongRunScore(s.longest), consistency_score: calcConsistencyScore(daysRun),
        efficiency_score: calcEfficiencyScore(eff), total_score: total,
      }, { onConflict: 'member_nickname,season_id' })
    }

    const { data: allStats } = await db.from('member_season_stats')
      .select('id').eq('season_id', season.id).order('total_score', { ascending: false })
    if (allStats) {
      for (let i = 0; i < allStats.length; i++) {
        await db.from('member_season_stats').update({ rank: i + 1 }).eq('id', allStats[i].id)
      }
    }
  }

  // LV는 시즌 무관 — 멤버별 전체 활동 누적으로 계산
  const { data: allMembers } = await db.from('members').select('nickname').eq('is_active', true)
  const seenNicks = new Set<string>()
  for (const m of (allMembers || [])) {
    if (seenNicks.has(m.nickname)) continue  // 멀티크루 같은 닉은 1번만
    seenNicks.add(m.nickname)
    const { data: allActs } = await db.from('activities')
      .select('distance_km, avg_pace_sec, date').eq('member_nickname', m.nickname)
    const totalDist = (allActs || []).reduce((sum: number, a: { distance_km: number }) => sum + Number(a.distance_km), 0)
    const totalDays = new Set((allActs || []).map((a: { date: string }) => a.date)).size
    const paceSecs = (allActs || []).filter((a: { avg_pace_sec: number }) => Number(a.avg_pace_sec) > 0).map((a: { avg_pace_sec: number }) => Number(a.avg_pace_sec))
    const cumAvgPace = paceSecs.length > 0 ? Math.round(paceSecs.reduce((a: number, b: number) => a + b, 0) / paceSecs.length) : 0
    const lv = calcLv(totalDist, cumAvgPace)
    await db.from('members').update({ total_dist: totalDist, total_days: totalDays, lv }).eq('nickname', m.nickname)
    updated++
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
