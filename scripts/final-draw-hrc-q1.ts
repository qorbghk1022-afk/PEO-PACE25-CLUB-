#!/usr/bin/env npx tsx
/**
 * HRC Q1-2026 최종 추첨 — 직접 실행해서 draw_results에 저장
 *
 * 로직은 /api/draw POST와 동일:
 *   - computeQuarterPool(HRC, Q1-2026)
 *   - 티켓 수만큼 풀 생성
 *   - 5등까지 랜덤 추첨, 당첨자는 풀에서 전부 제거 (중복 당첨 방지)
 *   - draw_results insert
 *
 * Dry-run: npx tsx scripts/final-draw-hrc-q1.ts
 * Apply:   npx tsx scripts/final-draw-hrc-q1.ts --apply
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const APPLY = process.argv.includes('--apply')
const HRC = '2891fdd5-545b-4144-81f6-229df8dd5457'
const QUARTER = 'Q1-2026'

const Q1 = {
  start: '2026-01-26',
  end: '2026-04-19',
  challengeDates: [
    { start: '2026-01-26', end: '2026-02-08' },
    { start: '2026-02-09', end: '2026-02-22' },
    { start: '2026-02-23', end: '2026-03-08' },
    { start: '2026-03-09', end: '2026-03-22' },
    { start: '2026-03-23', end: '2026-04-05' },
    { start: '2026-04-06', end: '2026-04-19' },
  ],
  sessionDates: ['2026-02-14', '2026-03-14', '2026-04-11'],
  manualSessions: {
    '2026-02-14': ['멀루', '네모러너', '머룬', 'JM', '백화'],
    '2026-04-11': ['머룬'],
  } as Record<string, string[]>,
}

const PRIZES = [
  { rank: 1, prize: '러닝화 (~20만원)' },
  { rank: 2, prize: '3만원 상품권' },
  { rank: 3, prize: '1만원 기프티콘' },
  { rank: 4, prize: '1만원 기프티콘' },
  { rank: 5, prize: '1만원 기프티콘' },
]

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // 기존 결과 확인 — 있으면 중단 (중복 방지)
  const { data: exist } = await db.from('draw_results').select('id')
    .eq('crew_id', HRC).eq('quarter', QUARTER).limit(1)
  if (exist && exist.length > 0) {
    console.error('❌ 이미 추첨 결과 있음. 먼저 reset-hrc-q1-draw.ts --apply 로 삭제하세요')
    process.exit(1)
  }

  // HRC 멤버
  const { data: mems } = await db.from('members').select('nickname').eq('crew_id', HRC)
  const members = (mems || []) as Array<{ nickname: string }>
  console.log(`HRC 멤버: ${members.length}명`)

  // HRC Q1 활동 (crew_id=HRC 또는 NULL/Strava)
  const { data: acts } = await db.from('activities')
    .select('member_nickname, date, distance_km')
    .gte('date', Q1.start).lte('date', Q1.end)
    .or(`crew_id.eq.${HRC},crew_id.is.null`)
  const actsList = (acts || []) as Array<{ member_nickname: string; date: string; distance_km: number }>

  // 분기 풀 계산
  const pool: Array<{ nickname: string; lottery_tickets: number }> = []
  const GOAL = 15
  for (const m of members) {
    let t = 0
    for (const cp of Q1.challengeDates) {
      const total = actsList
        .filter(a => a.member_nickname === m.nickname && a.date >= cp.start && a.date <= cp.end)
        .reduce((s, a) => s + Number(a.distance_km), 0)
      if (total >= GOAL) t++
    }
    for (const sd of Q1.sessionDates) {
      if (Q1.manualSessions[sd]?.includes(m.nickname)) { t += 2; continue }
      const total = actsList
        .filter(a => a.member_nickname === m.nickname && a.date === sd)
        .reduce((s, a) => s + Number(a.distance_km), 0)
      if (total >= GOAL) t += 2
    }
    if (t > 0) pool.push({ nickname: m.nickname, lottery_tickets: t })
  }

  console.log(`\n티켓 보유자: ${pool.length}명 / 총 티켓: ${pool.reduce((s, p) => s + p.lottery_tickets, 0)}장`)
  pool.sort((a, b) => b.lottery_tickets - a.lottery_tickets).slice(0, 10).forEach(p => {
    console.log(`  ${p.nickname}: ${p.lottery_tickets}장`)
  })

  // 추첨 풀
  const flatPool: string[] = []
  pool.forEach(p => { for (let i = 0; i < p.lottery_tickets; i++) flatPool.push(p.nickname) })

  // 5등까지 추첨
  const remaining = [...flatPool]
  const results: Array<{ rank: number; prize: string; winner_nickname: string; ticket_count: number }> = []
  for (const p of PRIZES) {
    if (remaining.length === 0) break
    const idx = Math.floor(Math.random() * remaining.length)
    const winner = remaining[idx]
    const tickets = pool.find(m => m.nickname === winner)?.lottery_tickets || 0
    for (let j = remaining.length - 1; j >= 0; j--) {
      if (remaining[j] === winner) remaining.splice(j, 1)
    }
    results.push({ rank: p.rank, prize: p.prize, winner_nickname: winner, ticket_count: tickets })
  }

  console.log('\n=== 추첨 결과 ===')
  for (const r of results) {
    console.log(`${r.rank}등: ${r.winner_nickname} — ${r.prize} (ticket=${r.ticket_count})`)
  }

  if (!APPLY) {
    console.log('\n[dry-run] 실제 저장하려면 --apply')
    return
  }

  const rows = results.map(r => ({ quarter: QUARTER, crew_id: HRC, ...r }))
  const { error } = await db.from('draw_results').insert(rows)
  if (error) { console.error('저장 실패:', error.message); process.exit(1) }
  console.log('\n✅ draw_results 저장 완료')
}

main().catch(e => { console.error(e); process.exit(1) })
