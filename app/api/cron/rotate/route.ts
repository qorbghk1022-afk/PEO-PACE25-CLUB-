/**
 * GET /api/cron/rotate
 *
 * 챌린지 rotation 전용 엔드포인트 (전체 cron에서 분리).
 * - 각 crew마다 독립 rotation
 * - sheet sync / strava / cleanup / tickets는 포함 안 함 → 60s 내 완주
 * - 수동 트리거: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/rotate
 * - Vercel cron 스케줄로 자동 실행 가능
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  calcSpeedScore,
  calcEnduranceScore,
  calcLongRunScore,
  calcConsistencyScore,
  calcEfficiencyScore,
  calcTotalScore,
} from '@/lib/scoring'

export const maxDuration = 300

// REST_MEMBERS (기존 cron/route.ts와 동일한 설정)
const REST_MEMBERS: Record<string, Record<string, string>> = {
  '갤러리킴': { '2026-03-09': '병가', '2026-03-23': '병가' },
  '꾸마': { '2026-03-09': '출산휴가', '2026-03-23': '출산휴가' },
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const log: string[] = []

  try {
    // KST 기준 오늘 (cron이 23:00 UTC=08:00 KST에 돌 때 UTC 기준이면 어제 날짜가 됨)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    const { data: crews } = await db.from('crews').select('id, name')
    if (!crews || crews.length === 0) {
      log.push('no crews')
      return NextResponse.json({ log })
    }

    const results: Array<{ crew: string; rotated: boolean; detail?: unknown; error?: string }> = []
    let rotated = 0

    for (const crew of crews) {
      try {
        const r = await rotateCrew(db, log, crew as { id: string; name: string }, today)
        if (r.rotated) rotated++
        results.push({ crew: crew.name, rotated: r.rotated, detail: r })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.push(`${crew.name} exception: ${msg}`)
        results.push({ crew: crew.name, rotated: false, error: msg })
      }
    }

    // 챌린지 회전 후 추첨권 재계산 (활동 데이터가 최신이라는 전제)
    const ticketResult = await syncLotteryTickets(db, log)

    await db.from('sync_logs').insert({
      activity_count: rotated,
      status: 'success',
      message: `rotate: ${log.join(' | ')}`,
    })

    return NextResponse.json({ success: true, rotated, total_crews: crews.length, tickets: ticketResult, results, log })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.push(`ERROR: ${msg}`)
    await db.from('sync_logs').insert({
      activity_count: 0,
      status: 'error',
      message: `rotate error: ${log.join(' | ')}`,
    })
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

async function rotateCrew(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
  crew: { id: string; name: string },
  today: string,
) {
  const { data: future } = await db
    .from('challenges')
    .select('id')
    .eq('crew_id', crew.id)
    .gte('end_date', today)
    .limit(1)
  if (future && future.length > 0) {
    log.push(`${crew.name}: future exists, skip`)
    return { rotated: false, reason: 'future_exists' }
  }

  const { data: ended } = await db
    .from('challenges')
    .select('id, season_id, start_date, end_date, seasons(generation)')
    .eq('crew_id', crew.id)
    .lt('end_date', today)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: {
        id: string; season_id: string; start_date: string; end_date: string;
        seasons: { generation: number } | { generation: number }[] | null
      } | null
    }

  let newStart: string
  let newEnd: string
  let prevGen = 0
  let scores: Awaited<ReturnType<typeof calcPeriodScoresForCrew>> = []

  if (ended) {
    scores = await calcPeriodScoresForCrew(db, ended.start_date, ended.end_date, crew.id)
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]
      await db.from('member_season_stats').upsert(
        {
          member_nickname: s.nickname,
          season_id: ended.season_id,
          distance_km: s.distance_km,
          longest_run_km: s.longest_run_km,
          avg_pace_sec: s.avg_pace_sec,
          days_run: s.days_run,
          efficiency: s.efficiency,
          speed_score: s.speed_score,
          endurance_score: s.endurance_score,
          longrun_score: s.longrun_score,
          consistency_score: s.consistency_score,
          efficiency_score: s.efficiency_score,
          total_score: s.total_score,
          rank: i + 1,
        },
        { onConflict: 'member_nickname,season_id' },
      )
    }
    await db.from('seasons').update({ is_current: false }).eq('id', ended.season_id)

    const d = new Date(`${ended.end_date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    newStart = toDateStr(d)
    d.setUTCDate(d.getUTCDate() + 13)
    newEnd = toDateStr(d)
    const gen = ended.seasons as { generation: number } | { generation: number }[] | null
    prevGen = Array.isArray(gen) ? gen[0]?.generation ?? 0 : gen?.generation ?? 0
  } else {
    newStart = today
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 13)
    newEnd = toDateStr(d)
    log.push(`${crew.name}: bootstrap`)
  }

  const { data: newSeason, error: sErr } = await db
    .from('seasons')
    .insert({
      generation: prevGen + 1,
      start_date: newStart,
      end_date: newEnd,
      is_current: true,
      crew_id: crew.id,
    })
    .select('id')
    .single()
  if (sErr || !newSeason) {
    log.push(`${crew.name} season err: ${sErr?.message}`)
    return { rotated: false, error: sErr?.message }
  }

  const { data: newChallenge, error: cErr } = await db
    .from('challenges')
    .insert({
      season_id: newSeason.id,
      crew_id: crew.id,
      goal_km: 15,
      fine_per_km: 3000,
      start_date: newStart,
      end_date: newEnd,
    })
    .select('id')
    .single()
  if (cErr || !newChallenge) {
    log.push(`${crew.name} challenge err: ${cErr?.message}`)
    return { rotated: false, error: cErr?.message }
  }

  log.push(`${crew.name}: new ${newStart}~${newEnd} gen${prevGen + 1}`)

  await assignTeamsForCrew(db, newChallenge.id, newStart, scores, crew.id, log, crew.name)

  return {
    rotated: true,
    crew: crew.name,
    newChallenge: { id: newChallenge.id, start: newStart, end: newEnd },
  }
}

async function calcPeriodScoresForCrew(
  db: ReturnType<typeof createServiceClient>,
  startDate: string,
  endDate: string,
  crewId: string,
) {
  const { data: crewMembers } = await db
    .from('members')
    .select('nickname')
    .eq('crew_id', crewId)
    .eq('is_active', true)
  const crewNicks = new Set((crewMembers || []).map(m => m.nickname))
  if (crewNicks.size === 0) return []

  const { data: activities } = await db
    .from('activities')
    .select('member_nickname, distance_km, avg_pace_sec, moving_time_sec, elapsed_time_sec, date')
    .gte('date', startDate)
    .lte('date', endDate)
    .or(`crew_id.eq.${crewId},crew_id.is.null`)

  const filtered = (activities || []).filter(a => crewNicks.has(a.member_nickname))
  if (filtered.length === 0) return []

  const stats: Record<string, { dist: number; longest: number; paceSecs: number[]; days: Set<string>; moving: number; elapsed: number }> = {}
  for (const a of filtered) {
    const nick = a.member_nickname
    if (!stats[nick]) stats[nick] = { dist: 0, longest: 0, paceSecs: [], days: new Set(), moving: 0, elapsed: 0 }
    const s = stats[nick]
    s.dist += Number(a.distance_km)
    s.longest = Math.max(s.longest, Number(a.distance_km))
    if (Number(a.avg_pace_sec) > 0) s.paceSecs.push(Number(a.avg_pace_sec))
    s.days.add(a.date)
    s.moving += Number(a.moving_time_sec) || 0
    s.elapsed += Number(a.elapsed_time_sec) || Number(a.moving_time_sec) || 0
  }

  return Object.entries(stats)
    .map(([nickname, s]) => {
      const avgPace = s.paceSecs.length > 0 ? Math.round(s.paceSecs.reduce((a, b) => a + b) / s.paceSecs.length) : 0
      const eff = s.elapsed > 0 ? s.moving / s.elapsed : 1
      const daysRun = s.days.size
      const speed_score = calcSpeedScore(avgPace)
      const endurance_score = calcEnduranceScore(s.dist)
      const longrun_score = calcLongRunScore(s.longest)
      const consistency_score = calcConsistencyScore(daysRun)
      const efficiency_score = calcEfficiencyScore(eff)
      const total_score = calcTotalScore({
        speed: speed_score, endurance: endurance_score, longRun: longrun_score,
        consistency: consistency_score, efficiency: efficiency_score,
      })
      return {
        nickname, distance_km: s.dist, longest_run_km: s.longest, avg_pace_sec: avgPace,
        days_run: daysRun, efficiency: eff,
        speed_score, endurance_score, longrun_score, consistency_score, efficiency_score, total_score,
      }
    })
    .sort((a, b) => b.total_score - a.total_score)
}

// ═══════════════════════════════════════════════════════════
// Sync lottery tickets (Q2 6주기 + 정기세션)
// ═══════════════════════════════════════════════════════════
async function syncLotteryTickets(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
) {
  const challengeDates = [
    { start: '2026-04-20', end: '2026-05-03' },
    { start: '2026-05-04', end: '2026-05-17' },
    { start: '2026-05-18', end: '2026-05-31' },
    { start: '2026-06-01', end: '2026-06-14' },
    { start: '2026-06-15', end: '2026-06-28' },
    { start: '2026-06-29', end: '2026-07-12' },
  ]
  const sessionDates = ['2026-05-09', '2026-06-13', '2026-07-11']
  const now = new Date()

  const { data: crews } = await db.from('crews').select('id, name')
  if (!crews || crews.length === 0) { log.push('Tickets: no crews'); return { updated: 0 } }

  let totalUpdated = 0
  for (const crew of crews) {
    const { data: mems } = await db.from('members')
      .select('nickname').eq('crew_id', crew.id).eq('is_active', true)
    if (!mems || mems.length === 0) continue
    const crewFilter = `crew_id.eq.${crew.id},crew_id.is.null`
    let updated = 0

    for (const m of mems) {
      let tickets = 0
      for (const ch of challengeDates) {
        if (new Date(ch.start) > now) continue
        const { data: acts } = await db.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).gte('date', ch.start).lte('date', ch.end)
          .or(crewFilter)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets++
      }
      for (const sd of sessionDates) {
        if (new Date(sd) > now) continue
        const { data: acts } = await db.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).eq('date', sd)
          .or(crewFilter)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets += 2
      }
      await db.from('members').update({ lottery_tickets: tickets })
        .eq('nickname', m.nickname).eq('crew_id', crew.id)
      updated++
    }
    log.push(`${crew.name} tickets: ${updated}`)
    totalUpdated += updated
  }
  return { updated: totalUpdated }
}

async function assignTeamsForCrew(
  db: ReturnType<typeof createServiceClient>,
  challengeId: string,
  challengeStartDate: string,
  scores: Array<{ nickname: string; total_score: number }>,
  crewId: string,
  log: string[],
  crewName: string,
) {
  const { data: crewMems } = await db
    .from('members')
    .select('nickname')
    .eq('crew_id', crewId)
    .eq('is_active', true)
  const memberNicknames = (crewMems || []).map(m => m.nickname)

  const scoredSet = new Set(scores.map(s => s.nickname))
  const ranked: string[] = [
    ...scores.filter(s => memberNicknames.includes(s.nickname)).map(s => s.nickname),
    ...memberNicknames.filter(n => !scoredSet.has(n)),
  ]

  const activeRanked = ranked.filter(n => !REST_MEMBERS[n]?.[challengeStartDate])
  const restNicknames = ranked.filter(n => !!REST_MEMBERS[n]?.[challengeStartDate])

  const teamAssignments: Array<{ team_num: number; member_nickname: string }> = []
  for (let i = 0; i < activeRanked.length; i++) {
    teamAssignments.push({
      team_num: Math.floor(i / 2) + 1,
      member_nickname: activeRanked[i],
    })
  }
  for (const nick of restNicknames) {
    teamAssignments.push({ team_num: 0, member_nickname: nick })
  }

  if (teamAssignments.length > 0) {
    const rows = teamAssignments.map(a => ({
      challenge_id: challengeId,
      team_num: a.team_num,
      member_nickname: a.member_nickname,
    }))
    const { error } = await db.from('challenge_teams').insert(rows)
    if (error) log.push(`${crewName} team err: ${error.message}`)
    else {
      const numTeams = Math.max(...teamAssignments.filter(a => a.team_num > 0).map(a => a.team_num), 0)
      log.push(`${crewName} teams: ${activeRanked.length} → ${numTeams}팀 + ${restNicknames.length} rest`)
    }
  }
}
