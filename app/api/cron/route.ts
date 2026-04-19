/**
 * GET /api/cron
 * Daily cron job (Vercel: 0 14 * * * = 23:00 KST)
 *
 * 1. Sync latest activity data from Google Sheets (1기)
 * 2. Trigger Strava sync (2기)
 * 3. If the current challenge has ended, close it:
 *    - Calculate Q-scores for the ended period
 *    - Create a new 2-week challenge
 *    - Auto-assign teams by Q-score ranking
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
  parseTimeStr,
  parsePaceStr,
} from '@/lib/scoring'

// Google Sheets public CSV export
const SHEET_ID = '1gdEsbzlsIoqo0lEsM3b23VJqsNZwZRW48Z3GATpgaIM'

// 크루별 시트 설정 (gid로 구분)
const CREW_SHEETS = [
  { name: 'HRC', gid: 0, crewId: '2891fdd5-545b-4144-81f6-229df8dd5457' },
  { name: 'PEO', gid: 9257927, crewId: '0bb28fad-31df-493b-a883-fda564836a64' },
]

// HRC crew ID (default)
const HRC_CREW_ID = '2891fdd5-545b-4144-81f6-229df8dd5457'

// Nickname corrections
const NICKNAME_FIXES: Record<string, string> = {
  '원': '진원',
  '키가케인던스': '키가케이던스',
  '키카케이던스': '키가케이던스',
}

// REST members excluded from team goal calculation
const REST_MEMBERS: Record<string, Record<string, string>> = {
  '갤러리킴': { '2026-03-09': '병가', '2026-03-23': '병가' },
  '꾸마': { '2026-03-09': '출산휴가', '2026-03-23': '출산휴가' },
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const log: string[] = []

  try {
    // ─── Step 1: Sync Google Sheets activity data (크루별) ───
    const sheetResult = await syncAllCrewSheets(db, log)

    // ─── Step 2: Trigger Strava sync (2기) ───
    const stravaResult = await triggerStravaSync(log)

    // ─── Step 3: Check if current challenge has ended ───
    const challengeResult = await handleChallengeRotation(db, log)

    // ─── Step 4: Cleanup stale Strava raw data (7-day cache) ───
    const cleanupResult = await cleanupStravaCache(db, log)

    // ─── Step 5: Sync lottery tickets ───
    const ticketResult = await syncLotteryTickets(db, log)

    // ─── Step 6: Log ───
    await db.from('sync_logs').insert({
      activity_count: sheetResult.count,
      status: 'success',
      message: log.join(' | '),
    })

    return NextResponse.json({
      success: true,
      sheet: sheetResult,
      strava: stravaResult,
      challenge: challengeResult,
      cleanup: cleanupResult,
      tickets: ticketResult,
      log,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.push(`ERROR: ${msg}`)
    await db.from('sync_logs').insert({
      activity_count: 0,
      status: 'error',
      message: log.join(' | '),
    })
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════
// Google Sheets sync — 크루별 시트 순회
// ═══════════════════════════════════════════════════════════
async function syncAllCrewSheets(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
) {
  let totalCount = 0
  for (const sheet of CREW_SHEETS) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${sheet.gid}`
    const result = await syncGoogleSheet(db, log, csvUrl, sheet.name, sheet.crewId)
    totalCount += result.count
  }
  return { count: totalCount }
}

async function syncGoogleSheet(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
  csvUrl?: string,
  sheetName?: string,
  crewId?: string,
) {
  const url = csvUrl || `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`
  const label = sheetName || 'Sheet'
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`)
    const csv = await res.text()
    const rows = parseCSV(csv)
    if (rows.length < 2) {
      log.push(`${label}: no data rows`)
      return { count: 0 }
    }

    // Header: 날짜, 회원 ID, 거리(KM), 케이던스, 시간, 평균페이스, 메모
    const header = rows[0]
    const dateIdx = header.findIndex(h => h.includes('날짜'))
    const nickIdx = header.findIndex(h => h.includes('회원'))
    const distIdx = header.findIndex(h => h.includes('거리'))
    const timeIdx = header.findIndex(h => h.includes('시간'))
    const paceIdx = header.findIndex(h => h.includes('페이스'))

    if (dateIdx < 0 || nickIdx < 0 || distIdx < 0) {
      log.push(`${label}: header mismatch`)
      return { count: 0 }
    }

    // Ensure all referenced members exist
    const { data: existingMembers } = await db
      .from('members')
      .select('nickname')
    const memberSet = new Set((existingMembers || []).map(m => m.nickname))

    let upsertCount = 0
    const batch: Array<Record<string, unknown>> = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row[dateIdx] || !row[nickIdx]) continue

      let nickname = row[nickIdx].trim()
      if (NICKNAME_FIXES[nickname]) nickname = NICKNAME_FIXES[nickname]
      if (!nickname) continue

      const dateStr = normalizeDate(row[dateIdx].trim())
      if (!dateStr) continue

      const distKm = parseFloat(row[distIdx]) || 0
      if (distKm <= 0) continue

      const timeStr = row[timeIdx]?.trim() || ''
      const paceStr = row[paceIdx]?.trim() || ''
      const movingSec = parseTimeStr(timeStr)
      const avgPaceSec = paceStr ? parsePaceStr(paceStr) : (distKm > 0 && movingSec > 0 ? Math.round(movingSec / distKm) : 0)
      const efficiency = movingSec > 0 ? movingSec / (movingSec * 1.05) : 1 // approximate (no elapsed for sheet data)

      // Auto-create member if missing
      if (!memberSet.has(nickname)) {
        await db.from('members').insert({ nickname, is_active: true, crew_id: crewId || null })
        memberSet.add(nickname)
      }

      batch.push({
        member_nickname: nickname,
        date: dateStr,
        distance_km: distKm,
        moving_time_sec: movingSec || null,
        elapsed_time_sec: movingSec || null,
        avg_pace_sec: avgPaceSec || null,
        efficiency,
        sport_type: 'Run',
        activity_name: `Sheet sync ${dateStr}`,
        crew_id: crewId || null,
      })
    }

    // Upsert in chunks (avoid duplicate key on member_nickname+date combo)
    // Since sheet data has no strava_activity_id, we use insert with on-conflict skip
    // Group by member+date and keep only the latest/largest distance
    const deduped = dedupeActivities(batch)

    for (const row of deduped) {
      // Check if activity already exists for this member+date+distance within the same crew
      let existQuery = db
        .from('activities')
        .select('id')
        .eq('member_nickname', row.member_nickname as string)
        .eq('date', row.date as string)
        .eq('distance_km', row.distance_km as number)
      if (row.crew_id) existQuery = existQuery.eq('crew_id', row.crew_id as string)
      else existQuery = existQuery.is('crew_id', null)
      const { data: existing } = await existQuery.limit(1)

      if (existing && existing.length > 0) continue

      const { error } = await db.from('activities').insert(row)
      if (!error) upsertCount++
    }

    log.push(`${label}: ${upsertCount} new activities synced`)
    return { count: upsertCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`${label} error: ${msg}`)
    return { count: 0 }
  }
}

// ═══════════════════════════════════════════════════════════
// Strava sync (2기) — delegates to existing /api/strava/sync
// ═══════════════════════════════════════════════════════════
async function triggerStravaSync(log: string[]) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/strava/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    })
    const data = await res.json()
    log.push(`Strava: ${data.synced ?? 0} activities synced`)
    return data
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`Strava error: ${msg}`)
    return { error: msg }
  }
}

// ═══════════════════════════════════════════════════════════
// Challenge rotation: end current → score → new challenge → teams
// ═══════════════════════════════════════════════════════════
async function handleChallengeRotation(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
) {
  const today = new Date().toISOString().slice(0, 10)

  // Find the most recent challenge that has ended
  const { data: endedChallenge } = await db
    .from('challenges')
    .select('*, seasons!inner(id, generation, start_date, end_date, is_current)')
    .lt('end_date', today)
    .order('end_date', { ascending: false })
    .limit(1)
    .single()

  // Check if there is already a challenge that covers today or the future
  const { data: futureChallenge } = await db
    .from('challenges')
    .select('id')
    .gte('end_date', today)
    .limit(1)

  if (futureChallenge && futureChallenge.length > 0) {
    log.push('Challenge: current/future challenge exists, no rotation needed')
    return { rotated: false }
  }

  if (!endedChallenge) {
    log.push('Challenge: no ended challenge found, skipping rotation')
    return { rotated: false }
  }

  log.push(`Challenge: rotating from ${endedChallenge.start_date}~${endedChallenge.end_date}`)

  // ─── Calculate Q-scores for the ended challenge period ───
  const scores = await calcPeriodScores(
    db,
    endedChallenge.start_date,
    endedChallenge.end_date,
  )
  log.push(`Scores: calculated for ${scores.length} members`)

  // Save scores to member_season_stats
  const seasonId = endedChallenge.season_id
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    await db.from('member_season_stats').upsert(
      {
        member_nickname: s.nickname,
        season_id: seasonId,
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

  // ─── Create new season + challenge ───
  const endedEnd = new Date(endedChallenge.end_date)
  const newStart = new Date(endedEnd)
  newStart.setDate(newStart.getDate() + 1)
  const newEnd = new Date(newStart)
  newEnd.setDate(newEnd.getDate() + 13) // 14 days total (start + 13)

  const newStartStr = toDateStr(newStart)
  const newEndStr = toDateStr(newEnd)

  // Determine generation number
  const prevGen = endedChallenge.seasons?.generation ?? 1
  const newGen = prevGen + 1

  // Mark old season as not current
  await db.from('seasons').update({ is_current: false }).eq('id', seasonId)

  // Create new season
  const { data: newSeason, error: seasonErr } = await db
    .from('seasons')
    .insert({
      generation: newGen,
      start_date: newStartStr,
      end_date: newEndStr,
      is_current: true,
    })
    .select('id')
    .single()

  if (seasonErr || !newSeason) {
    log.push(`Season create error: ${seasonErr?.message}`)
    return { rotated: false, error: seasonErr?.message }
  }

  // Create new challenge
  const { data: newChallenge, error: challengeErr } = await db
    .from('challenges')
    .insert({
      season_id: newSeason.id,
      goal_km: 15,
      fine_per_km: 3000,
      start_date: newStartStr,
      end_date: newEndStr,
    })
    .select('id')
    .single()

  if (challengeErr || !newChallenge) {
    log.push(`Challenge create error: ${challengeErr?.message}`)
    return { rotated: false, error: challengeErr?.message }
  }

  log.push(`New challenge: ${newStartStr}~${newEndStr} (season ${newGen})`)

  // ─── Auto-assign teams by Q-score ranking ───
  const teamAssignments = await assignTeams(
    db,
    newChallenge.id,
    newStartStr,
    scores,
    log,
  )

  return {
    rotated: true,
    ended: {
      start: endedChallenge.start_date,
      end: endedChallenge.end_date,
      scores: scores.length,
    },
    newChallenge: {
      id: newChallenge.id,
      start: newStartStr,
      end: newEndStr,
    },
    teams: teamAssignments,
  }
}

// ═══════════════════════════════════════════════════════════
// Calculate Q-scores for a date range
// ═══════════════════════════════════════════════════════════
async function calcPeriodScores(
  db: ReturnType<typeof createServiceClient>,
  startDate: string,
  endDate: string,
) {
  const { data: activities } = await db
    .from('activities')
    .select(
      'member_nickname, distance_km, avg_pace_sec, moving_time_sec, elapsed_time_sec, date',
    )
    .gte('date', startDate)
    .lte('date', endDate)

  if (!activities || activities.length === 0) return []

  // Aggregate per member
  const stats: Record<
    string,
    {
      dist: number
      longest: number
      paceSecs: number[]
      days: Set<string>
      moving: number
      elapsed: number
    }
  > = {}

  for (const a of activities) {
    const nick = a.member_nickname
    if (!stats[nick]) {
      stats[nick] = {
        dist: 0,
        longest: 0,
        paceSecs: [],
        days: new Set(),
        moving: 0,
        elapsed: 0,
      }
    }
    const s = stats[nick]
    s.dist += Number(a.distance_km)
    s.longest = Math.max(s.longest, Number(a.distance_km))
    if (Number(a.avg_pace_sec) > 0) s.paceSecs.push(Number(a.avg_pace_sec))
    s.days.add(a.date)
    s.moving += Number(a.moving_time_sec) || 0
    s.elapsed += Number(a.elapsed_time_sec) || Number(a.moving_time_sec) || 0
  }

  const results = Object.entries(stats).map(([nickname, s]) => {
    const avgPace =
      s.paceSecs.length > 0
        ? Math.round(s.paceSecs.reduce((a, b) => a + b) / s.paceSecs.length)
        : 0
    const eff = s.elapsed > 0 ? s.moving / s.elapsed : 1
    const daysRun = s.days.size

    const speed_score = calcSpeedScore(avgPace)
    const endurance_score = calcEnduranceScore(s.dist)
    const longrun_score = calcLongRunScore(s.longest)
    const consistency_score = calcConsistencyScore(daysRun)
    const efficiency_score = calcEfficiencyScore(eff)
    const total_score = calcTotalScore({
      speed: speed_score,
      endurance: endurance_score,
      longRun: longrun_score,
      consistency: consistency_score,
      efficiency: efficiency_score,
    })

    return {
      nickname,
      distance_km: s.dist,
      longest_run_km: s.longest,
      avg_pace_sec: avgPace,
      days_run: daysRun,
      efficiency: eff,
      speed_score,
      endurance_score,
      longrun_score,
      consistency_score,
      efficiency_score,
      total_score,
    }
  })

  // Sort by total_score descending
  results.sort((a, b) => b.total_score - a.total_score)
  return results
}

// ═══════════════════════════════════════════════════════════
// Auto-assign teams: rank 1-2 → team 1, rank 3-4 → team 2, etc.
// REST_MEMBERS with active reasons are excluded from team goals
// but still assigned to teams.
// ═══════════════════════════════════════════════════════════
async function assignTeams(
  db: ReturnType<typeof createServiceClient>,
  challengeId: string,
  challengeStartDate: string,
  scores: Array<{ nickname: string; total_score: number }>,
  log: string[],
) {
  // Get all active members in the crew
  const { data: crewMembers } = await db
    .from('crew_members')
    .select('member_nickname')
    .eq('crew_id', HRC_CREW_ID)

  // If no crew_members table or no results, fall back to active members
  let memberNicknames: string[]
  if (crewMembers && crewMembers.length > 0) {
    memberNicknames = crewMembers.map(cm => cm.member_nickname)
  } else {
    const { data: allMembers } = await db
      .from('members')
      .select('nickname')
      .eq('is_active', true)
    memberNicknames = (allMembers || []).map(m => m.nickname)
  }

  // Build ranked list: members with scores first (by rank), then unscored
  const scoredSet = new Set(scores.map(s => s.nickname))
  const ranked: string[] = [
    ...scores.filter(s => memberNicknames.includes(s.nickname)).map(s => s.nickname),
    ...memberNicknames.filter(n => !scoredSet.has(n)),
  ]

  // Exclude REST members from ranking (they get team -1 effectively)
  const activeRanked = ranked.filter(
    n => !REST_MEMBERS[n]?.[challengeStartDate],
  )
  const restNicknames = ranked.filter(
    n => !!REST_MEMBERS[n]?.[challengeStartDate],
  )

  // Assign: every 2 members = 1 team
  const teamAssignments: Array<{
    team_num: number
    member_nickname: string
  }> = []

  for (let i = 0; i < activeRanked.length; i++) {
    const teamNum = Math.floor(i / 2) + 1
    teamAssignments.push({
      team_num: teamNum,
      member_nickname: activeRanked[i],
    })
  }

  // REST members still go into the DB but won't affect goal calc
  // They are assigned to a virtual team 0 (displayed as '-' in UI)
  for (const nick of restNicknames) {
    teamAssignments.push({ team_num: 0, member_nickname: nick })
  }

  // Insert into challenge_teams
  if (teamAssignments.length > 0) {
    const rows = teamAssignments.map(a => ({
      challenge_id: challengeId,
      team_num: a.team_num,
      member_nickname: a.member_nickname,
    }))
    const { error } = await db.from('challenge_teams').insert(rows)
    if (error) {
      log.push(`Team assign error: ${error.message}`)
    } else {
      const numTeams = Math.max(
        ...teamAssignments.filter(a => a.team_num > 0).map(a => a.team_num),
        0,
      )
      log.push(
        `Teams: ${activeRanked.length} members → ${numTeams} teams, ${restNicknames.length} resting`,
      )
    }
  }

  return teamAssignments
}

// ═══════════════════════════════════════════════════════════
// Cleanup stale Strava raw activity data (7-day cache policy)
// Only deletes Strava activities older than 7 days whose
// season scores have already been calculated.
// ═══════════════════════════════════════════════════════════
async function cleanupStravaCache(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
) {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 7)
    const cutoff = toDateStr(cutoffDate)

    // Find seasons that ended before the cutoff and have scores calculated
    const { data: scoredSeasons } = await db
      .from('seasons')
      .select('id, end_date')
      .lt('end_date', cutoff)

    if (!scoredSeasons || scoredSeasons.length === 0) {
      log.push('Cleanup: no completed seasons older than 7 days')
      return { deleted: 0 }
    }

    let totalDeleted = 0

    for (const season of scoredSeasons) {
      // Verify scores exist for this season
      const { count: scoreCount } = await db
        .from('member_season_stats')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', season.id)

      if (!scoreCount || scoreCount === 0) {
        // Scores not yet calculated, skip deletion
        continue
      }

      // Find the season's start_date
      const { data: seasonData } = await db
        .from('seasons')
        .select('start_date')
        .eq('id', season.id)
        .single()

      if (!seasonData) continue

      // Delete Strava activities within this scored season's date range
      const { data: deleted, error: delErr } = await db
        .from('activities')
        .delete()
        .not('strava_activity_id', 'is', null)
        .gte('date', seasonData.start_date)
        .lte('date', season.end_date)
        .select('id')

      if (delErr) {
        log.push(`Cleanup error (season ${season.id}): ${delErr.message}`)
        continue
      }

      totalDeleted += deleted?.length ?? 0
    }

    log.push(`Cleanup: ${totalDeleted} stale Strava activities deleted`)
    return { deleted: totalDeleted }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`Cleanup error: ${msg}`)
    return { deleted: 0 }
  }
}

// ═══════════════════════════════════════════════════════════
// Sync lottery tickets: recalculate from activities → update DB
// ═══════════════════════════════════════════════════════════
async function syncLotteryTickets(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
) {
  const challengeDates = [
    { start: '2026-01-26', end: '2026-02-08' },
    { start: '2026-02-09', end: '2026-02-22' },
    { start: '2026-02-23', end: '2026-03-08' },
    { start: '2026-03-09', end: '2026-03-22' },
    { start: '2026-03-23', end: '2026-04-05' },
    { start: '2026-04-06', end: '2026-04-19' },
  ]
  const sessionDates = ['2026-02-21', '2026-03-21', '2026-04-18']
  const now = new Date()

  const { data: mems } = await db.from('members').select('nickname').eq('crew_id', HRC_CREW_ID)
  if (!mems || mems.length === 0) { log.push('Tickets: no members'); return { updated: 0 } }

  // HRC 크루 활동 또는 크루 미지정(Strava) 활동 모두 카운트
  const crewFilter = `crew_id.eq.${HRC_CREW_ID},crew_id.is.null`

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
      .eq('nickname', m.nickname).eq('crew_id', HRC_CREW_ID)
    updated++
  }

  log.push(`Tickets: ${updated} members synced`)
  return { updated }
}

// ═══════════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════════

/** Parse CSV text into rows of string arrays */
function parseCSV(text: string): string[][] {
  const lines = text.split('\n')
  return lines
    .map(line => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            current += '"'
            i++
          } else if (ch === '"') {
            inQuotes = false
          } else {
            current += ch
          }
        } else {
          if (ch === '"') {
            inQuotes = true
          } else if (ch === ',') {
            result.push(current)
            current = ''
          } else {
            current += ch
          }
        }
      }
      result.push(current.replace(/\r$/, ''))
      return result
    })
    .filter(row => row.some(cell => cell.trim() !== ''))
}

/** Normalize date string to YYYY-MM-DD */
function normalizeDate(s: string): string | null {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // YYYY/MM/DD or YYYY.MM.DD
  const m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

/** Date to YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Deduplicate activities: keep all unique member+date+distance combos */
function dedupeActivities(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Set<string>()
  return rows.filter(r => {
    const key = `${r.member_nickname}|${r.date}|${r.distance_km}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
