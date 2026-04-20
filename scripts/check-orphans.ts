#!/usr/bin/env npx tsx
/**
 * Orphan 탐지 — members에 없는 nickname을 참조하는 row 찾기
 *
 * member_nickname이 FK가 아니라 문자열이라 닉네임 변경 시 dangling 발생 가능.
 * 이 스크립트로 상시 모니터링.
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // 전체 members 닉
  const { data: mems } = await db.from('members').select('nickname')
  const knownNicks = new Set((mems || []).map(m => m.nickname))
  console.log(`members 닉네임 수: ${knownNicks.size}\n`)

  // 1. activities
  const { data: acts } = await db.from('activities').select('member_nickname')
  const actOrphans = new Map<string, number>()
  for (const a of (acts || [])) {
    if (!knownNicks.has(a.member_nickname)) {
      actOrphans.set(a.member_nickname, (actOrphans.get(a.member_nickname) || 0) + 1)
    }
  }
  console.log(`=== activities orphans: ${actOrphans.size}종 ===`)
  for (const [n, c] of [...actOrphans.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  "${n}" (${c}건)`)
  }

  // 2. challenge_teams
  const { data: cts } = await db.from('challenge_teams').select('member_nickname')
  const ctOrphans = new Map<string, number>()
  for (const t of (cts || [])) {
    if (!knownNicks.has(t.member_nickname)) {
      ctOrphans.set(t.member_nickname, (ctOrphans.get(t.member_nickname) || 0) + 1)
    }
  }
  console.log(`\n=== challenge_teams orphans: ${ctOrphans.size}종 ===`)
  for (const [n, c] of [...ctOrphans.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  "${n}" (${c}건)`)
  }

  // 3. draw_results
  const { data: drs } = await db.from('draw_results').select('winner_nickname')
  const drOrphans = new Map<string, number>()
  for (const r of (drs || [])) {
    if (!knownNicks.has(r.winner_nickname)) {
      drOrphans.set(r.winner_nickname, (drOrphans.get(r.winner_nickname) || 0) + 1)
    }
  }
  console.log(`\n=== draw_results orphans: ${drOrphans.size}종 ===`)
  for (const [n, c] of [...drOrphans.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  "${n}" (${c}건)`)
  }

  const totalOrphans = actOrphans.size + ctOrphans.size + drOrphans.size
  console.log(`\n총 orphan 종류: ${totalOrphans}${totalOrphans === 0 ? ' ✅' : ' ⚠️'}`)
}
main().catch(e => { console.error(e); process.exit(1) })
