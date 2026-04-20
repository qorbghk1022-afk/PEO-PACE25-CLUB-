#!/usr/bin/env npx tsx
/**
 * scripts/sync-sheet.ts — HRC + PEO 시트 최신 데이터 DB 반영
 *
 * cron의 syncAllCrewSheets 로직을 로컬에서 실행.
 * Vercel 60s timeout과 무관하게 끝까지 처리 가능.
 *
 * 사용법:
 *   npx tsx scripts/sync-sheet.ts           # dry-run (변경사항 출력만)
 *   npx tsx scripts/sync-sheet.ts --apply   # 실제 적용
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const APPLY = process.argv.includes('--apply')
const SHEET_ID = '1gdEsbzlsIoqo0lEsM3b23VJqsNZwZRW48Z3GATpgaIM'
const CREW_SHEETS = [
  { name: 'HRC', gid: 0, crewId: '2891fdd5-545b-4144-81f6-229df8dd5457' },
  { name: 'PEO', gid: 9257927, crewId: '0bb28fad-31df-493b-a883-fda564836a64' },
]
const NICKNAME_FIXES: Record<string, string> = {
  '원': '진원',
  '키가케인던스': '키가케이던스',
  '키카케이던스': '키가케이던스',
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function parseCSV(text: string): string[][] {
  return text.split('\n').map(line => {
    const out: string[] = []
    let cur = ''; let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { out.push(cur); cur = '' }
        else cur += ch
      }
    }
    out.push(cur.replace(/\r$/, ''))
    return out
  }).filter(r => r.some(c => c.trim() !== ''))
}

function parseTimeStr(s: string): number {
  if (!s) return 0
  const parts = s.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}
function parsePaceStr(s: string): number {
  if (!s) return 0
  const parts = s.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}
function normalizeDate(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

async function syncCrew(sheet: typeof CREW_SHEETS[0]) {
  console.log(`\n─── ${sheet.name} (gid=${sheet.gid}) ───`)
  const csv = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${sheet.gid}`).then(r => r.text())
  const rows = parseCSV(csv)
  if (rows.length < 2) { console.log('  빈 시트'); return { missing: 0, inserted: 0 } }

  const header = rows[0]
  const dateIdx = header.findIndex(h => h.includes('날짜'))
  const nickIdx = header.findIndex(h => h.includes('회원'))
  const distIdx = header.findIndex(h => h.includes('거리'))
  const timeIdx = header.findIndex(h => h.includes('시간'))
  const paceIdx = header.findIndex(h => h.includes('페이스'))
  if (dateIdx < 0 || nickIdx < 0 || distIdx < 0) {
    console.log(`  header mismatch (data 미입력): ${header.join('|')}`)
    return { missing: 0, inserted: 0 }
  }

  // 시트 파싱
  type SheetRow = { nickname: string; date: string; distKm: number; movingSec: number; avgPaceSec: number }
  const parsed: SheetRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[dateIdx] || !row[nickIdx]) continue
    let nickname = row[nickIdx].trim()
    if (NICKNAME_FIXES[nickname]) nickname = NICKNAME_FIXES[nickname]
    if (!nickname) continue
    const date = normalizeDate(row[dateIdx].trim())
    if (!date) continue
    const distKm = parseFloat(row[distIdx]) || 0
    if (distKm <= 0) continue
    const movingSec = parseTimeStr(row[timeIdx]?.trim() || '')
    const paceStr = row[paceIdx]?.trim() || ''
    const avgPaceSec = paceStr ? parsePaceStr(paceStr) : (movingSec && distKm ? Math.round(movingSec / distKm) : 0)
    parsed.push({ nickname, date, distKm, movingSec, avgPaceSec })
  }
  console.log(`  시트 행: ${parsed.length}`)

  // 해당 크루 기존 활동 로드 (crew_id=sheet.crewId)
  const { data: existing } = await db
    .from('activities')
    .select('member_nickname, date, distance_km')
    .eq('crew_id', sheet.crewId)
  const existKeys = new Set((existing || []).map(a => `${a.member_nickname}|${a.date}|${Number(a.distance_km).toFixed(2)}`))

  // 누락된 것만 추출
  const missing: SheetRow[] = []
  for (const p of parsed) {
    const key = `${p.nickname}|${p.date}|${p.distKm.toFixed(2)}`
    if (!existKeys.has(key)) missing.push(p)
  }
  console.log(`  누락: ${missing.length}건`)
  if (missing.length > 0 && missing.length <= 20) {
    for (const m of missing) console.log(`    ${m.date} ${m.nickname} ${m.distKm}km`)
  }

  if (!APPLY) return { missing: missing.length, inserted: 0 }

  // 신규 회원 먼저 확인 후 자동 생성
  const { data: allMems } = await db.from('members').select('nickname, crew_id')
  const memByKey = new Map((allMems || []).map(m => [`${m.nickname}|${m.crew_id}`, m]))
  const missingMembers = new Set<string>()
  for (const m of missing) {
    if (!memByKey.has(`${m.nickname}|${sheet.crewId}`)) missingMembers.add(m.nickname)
  }
  for (const nick of missingMembers) {
    console.log(`  ⚠ 회원 auto-create: ${nick} @ ${sheet.name}`)
    await db.from('members').insert({ nickname: nick, is_active: true, crew_id: sheet.crewId })
  }

  // 배치 insert
  const rowsToInsert = missing.map(m => {
    const efficiency = m.movingSec > 0 ? m.movingSec / (m.movingSec * 1.05) : 1
    return {
      member_nickname: m.nickname,
      date: m.date,
      distance_km: m.distKm,
      moving_time_sec: m.movingSec || null,
      elapsed_time_sec: m.movingSec || null,
      avg_pace_sec: m.avgPaceSec || null,
      efficiency,
      sport_type: 'Run',
      activity_name: `Sheet sync ${m.date}`,
      crew_id: sheet.crewId,
    }
  })

  let inserted = 0
  const batchSize = 50
  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize)
    const { error } = await db.from('activities').insert(batch)
    if (error) { console.error(`  insert err: ${error.message}`); throw error }
    inserted += batch.length
  }
  console.log(`  ✅ insert: ${inserted}건`)
  return { missing: missing.length, inserted }
}

async function main() {
  console.log('─'.repeat(60))
  console.log(`MODE: ${APPLY ? '🔴 APPLY' : '🟢 DRY-RUN'}`)
  console.log(`START: ${new Date().toISOString()}`)
  console.log('─'.repeat(60))

  let totalMissing = 0, totalInserted = 0
  for (const sheet of CREW_SHEETS) {
    const r = await syncCrew(sheet)
    totalMissing += r.missing
    totalInserted += r.inserted
  }

  console.log('\n─'.repeat(60))
  console.log(`총 누락: ${totalMissing}`)
  console.log(`${APPLY ? '실제 insert' : '예상 insert'}: ${APPLY ? totalInserted : totalMissing}`)

  if (APPLY) {
    // total_dist / total_days 재계산
    console.log('\n[후처리] members.total_dist/total_days 재계산...')
    const { data: acts } = await db.from('activities').select('member_nickname, date, distance_km').range(0, 9999)
    const stats = new Map<string, { dist: number; days: Set<string> }>()
    for (const a of (acts || [])) {
      if (!stats.has(a.member_nickname)) stats.set(a.member_nickname, { dist: 0, days: new Set() })
      const s = stats.get(a.member_nickname)!
      s.dist += Number(a.distance_km)
      s.days.add(a.date)
    }
    const { data: mems } = await db.from('members').select('nickname').not('user_id', 'is', null)
    let updated = 0
    for (const m of (mems || [])) {
      const s = stats.get(m.nickname) || { dist: 0, days: new Set() }
      await db.from('members').update({
        total_dist: Math.round(s.dist * 100) / 100,
        total_days: s.days.size,
      }).eq('nickname', m.nickname)
      updated++
    }
    console.log(`  ✅ 재계산: ${updated}명`)
  }
  console.log(`\nDONE: ${new Date().toISOString()}`)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
