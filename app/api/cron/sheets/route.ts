/**
 * GET /api/cron/sheets
 * Sheet (Google Sheets) 활동 동기화 전용 cron.
 * 가벼운 작업: CSV fetch + DB insert. 보통 ~10s 안에 완주.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseTimeStr, parsePaceStr } from '@/lib/scoring'

export const maxDuration = 60

const SHEET_ID = '1gdEsbzlsIoqo0lEsM3b23VJqsNZwZRW48Z3GATpgaIM'
const CREW_SHEETS = [
  { name: 'HRC', gid: 0, crewId: '2891fdd5-545b-4144-81f6-229df8dd5457' },
  { name: 'PEO', gid: 9257927, crewId: '0bb28fad-31df-493b-a883-fda564836a64' },
]
const NICKNAME_FIXES: Record<string, string> = {
  '원': '진원', '키가케인던스': '키가케이던스', '키카케이던스': '키가케이던스',
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const log: string[] = []

  try {
    let totalCount = 0
    const mismatchesByCrew: Record<string, string[]> = {}
    for (const sheet of CREW_SHEETS) {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${sheet.gid}`
      const r = await syncSheet(db, log, url, sheet.name, sheet.crewId)
      totalCount += r.count
      if (r.mismatches?.length) mismatchesByCrew[sheet.name] = r.mismatches
    }

    await db.from('sync_logs').insert({
      activity_count: totalCount,
      status: 'success',
      message: `[sheets] ${log.join(' | ')}`,
    })

    return NextResponse.json({ success: true, count: totalCount, mismatches: mismatchesByCrew, log })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.push(`ERROR: ${msg}`)
    await db.from('sync_logs').insert({ activity_count: 0, status: 'error', message: `[sheets] ${log.join(' | ')}` })
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

async function syncSheet(
  db: ReturnType<typeof createServiceClient>,
  log: string[],
  csvUrl: string,
  label: string,
  crewId: string,
) {
  try {
    const res = await fetch(csvUrl)
    if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`)
    const csv = await res.text()
    const rows = parseCSV(csv)
    if (rows.length < 2) {
      log.push(`${label}: no data`)
      return { count: 0 }
    }

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

    const { data: existingMembers } = await db.from('members').select('nickname').eq('crew_id', crewId)
    const memberSet = new Set((existingMembers || []).map(m => m.nickname))

    // 1) 시트에서 sheet 활동 후보 추출 (가장 이른/늦은 날짜 추적)
    const batch: Array<Record<string, unknown>> = []
    const mismatches = new Set<string>()
    let skippedCount = 0
    let minDate = '9999-12-31'
    let maxDate = '0000-01-01'

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
      const avgPaceSec = paceStr ? parsePaceStr(paceStr) : (movingSec > 0 ? Math.round(movingSec / distKm) : 0)
      const efficiency = movingSec > 0 ? movingSec / (movingSec * 1.05) : 1

      if (!memberSet.has(nickname)) {
        mismatches.add(nickname); skippedCount++; continue
      }

      batch.push({
        member_nickname: nickname, date: dateStr, distance_km: distKm,
        moving_time_sec: movingSec || null, elapsed_time_sec: movingSec || null,
        avg_pace_sec: avgPaceSec || null, efficiency,
        sport_type: 'Run', activity_name: `Sheet sync ${dateStr}`, crew_id: crewId,
      })
      if (dateStr < minDate) minDate = dateStr
      if (dateStr > maxDate) maxDate = dateStr
    }

    const deduped = dedupe(batch)
    if (deduped.length === 0) { log.push(`${label}: 0 new (empty)`); return { count: 0 } }

    // 2-a) DB의 기존 sheet 활동 fetch (해당 크루 + 날짜 범위)
    const { data: existingSheetRows } = await db.from('activities')
      .select('member_nickname, date, distance_km')
      .eq('crew_id', crewId)
      .gte('date', minDate)
      .lte('date', maxDate)
    const existingSheetKeys = new Set((existingSheetRows || []).map(r => `${r.member_nickname}|${r.date}|${r.distance_km}`))

    // 2-b) DB의 Strava 활동 fetch (crew_id NULL, 같은 날짜 범위)
    // sheet row를 insert하기 전에 같은 닉/날짜 Strava 활동이 있으면 skip → dup 방지
    const { data: stravaRows } = await db.from('activities')
      .select('member_nickname, date, distance_km')
      .is('crew_id', null)
      .not('strava_activity_id', 'is', null)
      .gte('date', minDate)
      .lte('date', maxDate)
    const stravaByNickDate: Record<string, number[]> = {}
    for (const s of (stravaRows || [])) {
      const k = `${s.member_nickname}|${s.date}`
      if (!stravaByNickDate[k]) stravaByNickDate[k] = []
      stravaByNickDate[k].push(Number(s.distance_km))
    }

    // 3) 기존에 없고 Strava 중복도 아닌 row만 추출 → bulk insert
    let stravaSkipped = 0
    const newRows = deduped.filter(r => {
      if (existingSheetKeys.has(`${r.member_nickname}|${r.date}|${r.distance_km}`)) return false
      // Strava에 같은 닉/날짜로 ±0.3km 이내 활동이 있으면 sheet 무시 (Strava 우선)
      const list = stravaByNickDate[`${r.member_nickname}|${r.date}`] || []
      const hasStravaMatch = list.some(d => Math.abs(d - Number(r.distance_km)) < 0.3)
      if (hasStravaMatch) { stravaSkipped++; return false }
      return true
    })
    if (stravaSkipped > 0) log.push(`${label}: Strava dup ${stravaSkipped} skip`)
    let upsertCount = 0
    for (let i = 0; i < newRows.length; i += 500) {
      const chunk = newRows.slice(i, i + 500)
      const { error } = await db.from('activities').insert(chunk)
      if (!error) upsertCount += chunk.length
      else log.push(`${label} insert err: ${error.message}`)
    }

    log.push(`${label}: ${upsertCount} new`)
    if (mismatches.size > 0) log.push(`${label} 닉 불일치 (${mismatches.size}종, ${skippedCount}건): ${[...mismatches].join(', ')}`)
    return { count: upsertCount, mismatches: [...mismatches], skipped: skippedCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`${label} err: ${msg}`)
    return { count: 0 }
  }
}

function parseCSV(text: string): string[][] {
  return text.split('\n').map(line => {
    const result: string[] = []; let cur = ''; let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { result.push(cur); cur = '' }
        else cur += ch
      }
    }
    result.push(cur.replace(/\r$/, ''))
    return result
  }).filter(r => r.some(c => c.trim() !== ''))
}

function normalizeDate(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

function dedupe(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>()
  return rows.filter(r => {
    const key = `${r.member_nickname}|${r.date}|${r.distance_km}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}
