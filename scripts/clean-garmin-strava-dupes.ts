#!/usr/bin/env npx tsx
/**
 * Garmin → Strava 양쪽 sync로 인한 중복 활동 정리.
 * 기준: 같은 닉 + 같은 날짜 + 거리 ±0.3km + moving_time ±2분 + 둘 다 strava_activity_id 있음
 * 각 그룹에서 가장 긴 거리 row만 keep, 나머지 삭제.
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const APPLY = process.argv.includes('--apply')
const NICK_FILTER = process.argv.find(a => a.startsWith('--nick='))?.split('=')[1]
const EXCLUDE_NICKS = new Set((process.argv.find(a => a.startsWith('--exclude='))?.split('=')[1] || '').split(',').filter(Boolean))
const DIST_TOL = 0.3
const TIME_TOL_SEC = 120
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  let q = db.from('activities')
    .select('id, member_nickname, date, distance_km, moving_time_sec, sport_type, activity_name, strava_activity_id, created_at')
    .not('strava_activity_id', 'is', null)
    .order('member_nickname').order('date')
  if (NICK_FILTER) q = q.eq('member_nickname', NICK_FILTER)
  const { data: acts } = await q

  type Row = NonNullable<typeof acts>[number]
  // 닉+날짜 그룹화
  const byKey: Record<string, Row[]> = {}
  for (const a of (acts || [])) {
    const k = `${a.member_nickname}|${a.date}`
    if (!byKey[k]) byKey[k] = []
    byKey[k].push(a)
  }

  type Group = { nick: string; date: string; keep: Row; deletes: Row[] }
  const groups: Group[] = []

  for (const [key, rows] of Object.entries(byKey)) {
    if (rows.length < 2) continue
    const [nick, date] = key.split('|')
    if (EXCLUDE_NICKS.has(nick)) continue
    // sub-group by distance ±0.3km + time ±2min
    const visited = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      if (visited.has(rows[i].id)) continue
      const subGroup = [rows[i]]
      for (let j = i + 1; j < rows.length; j++) {
        if (visited.has(rows[j].id)) continue
        const distDiff = Math.abs(Number(rows[i].distance_km) - Number(rows[j].distance_km))
        const timeDiff = Math.abs((Number(rows[i].moving_time_sec) || 0) - (Number(rows[j].moving_time_sec) || 0))
        if (distDiff <= DIST_TOL && timeDiff <= TIME_TOL_SEC) {
          subGroup.push(rows[j])
          visited.add(rows[j].id)
        }
      }
      if (subGroup.length > 1) {
        visited.add(rows[i].id)
        // keep longest distance
        subGroup.sort((a, b) => Number(b.distance_km) - Number(a.distance_km))
        const keep = subGroup[0]
        const deletes = subGroup.slice(1)
        groups.push({ nick, date, keep, deletes })
      }
    }
  }

  console.log(`=== 중복 그룹: ${groups.length}건, 삭제 대상: ${groups.reduce((s, g) => s + g.deletes.length, 0)}건 ===\n`)
  for (const g of groups) {
    console.log(`📅 ${g.date} | ${g.nick}`)
    console.log(`   KEEP   ${Number(g.keep.distance_km).toFixed(2)}km | sid=${g.keep.strava_activity_id}`)
    for (const d of g.deletes) {
      console.log(`   DELETE ${Number(d.distance_km).toFixed(2)}km | sid=${d.strava_activity_id}`)
    }
  }

  // 닉별 요약
  const byNick: Record<string, number> = {}
  for (const g of groups) byNick[g.nick] = (byNick[g.nick] || 0) + g.deletes.length
  console.log(`\n=== 닉별 삭제 건수 ===`)
  for (const [nick, count] of Object.entries(byNick).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${nick}: ${count}건`)
  }

  if (APPLY && groups.length > 0) {
    console.log(`\n--apply: 삭제 중...`)
    let deleted = 0
    for (const g of groups) {
      for (const d of g.deletes) {
        const { error } = await db.from('activities').delete().eq('id', d.id)
        if (!error) deleted++
        else console.log(`  실패 ${d.id}: ${error.message}`)
      }
    }
    console.log(`✅ ${deleted}건 삭제 완료`)
  } else if (groups.length > 0) {
    console.log(`\n실제 삭제: npx tsx scripts/clean-garmin-strava-dupes.ts --apply`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
