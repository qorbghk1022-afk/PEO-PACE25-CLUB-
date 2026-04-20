#!/usr/bin/env npx tsx
/**
 * scripts/reform-peo-teams.ts — PEO 현재 챌린지 팀 재배정
 *
 * - 팀1: 백화 + 가윤 (고정)
 * - 나머지 팀: 나머지 멤버 랜덤 셔플 후 2명씩 페어
 *
 * Dry-run: npx tsx scripts/reform-peo-teams.ts
 * Apply:   npx tsx scripts/reform-peo-teams.ts --apply
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
const PEO = '0bb28fad-31df-493b-a883-fda564836a64'
const FIXED_PAIR = ['백화', '가윤']

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  // PEO 현재 챌린지 (오늘 포함)
  const { data: ch, error: chErr } = await db
    .from('challenges')
    .select('id, start_date, end_date')
    .eq('crew_id', PEO)
    .lte('start_date', today)
    .gte('end_date', today)
    .maybeSingle()
  if (chErr || !ch) {
    console.error('PEO 현재 챌린지 못 찾음:', chErr?.message)
    process.exit(1)
  }
  console.log(`현재 챌린지: ${ch.start_date} ~ ${ch.end_date} (id: ${ch.id})`)

  // PEO 활성 멤버
  const { data: mems } = await db.from('members')
    .select('nickname').eq('crew_id', PEO).eq('is_active', true)
  const nicknames = (mems || []).map(m => m.nickname)
  console.log(`PEO 활성 멤버: ${nicknames.length}명`)

  // FIXED_PAIR 둘 다 존재하는지 확인
  const missing = FIXED_PAIR.filter(n => !nicknames.includes(n))
  if (missing.length > 0) {
    console.error(`고정 페어 중 누락: ${missing.join(', ')}`)
    process.exit(1)
  }

  // 나머지 멤버 셔플
  const rest = nicknames.filter(n => !FIXED_PAIR.includes(n))
  const shuffled = shuffle(rest)

  // 팀 배정: 팀1 = 고정, 팀2~ = 2명씩
  const assignments: Array<{ team_num: number; member_nickname: string }> = []
  assignments.push({ team_num: 1, member_nickname: FIXED_PAIR[0] })
  assignments.push({ team_num: 1, member_nickname: FIXED_PAIR[1] })
  for (let i = 0; i < shuffled.length; i++) {
    const teamNum = Math.floor(i / 2) + 2
    assignments.push({ team_num: teamNum, member_nickname: shuffled[i] })
  }

  // 미리보기
  const byTeam: Record<number, string[]> = {}
  for (const a of assignments) {
    if (!byTeam[a.team_num]) byTeam[a.team_num] = []
    byTeam[a.team_num].push(a.member_nickname)
  }
  console.log('\n=== 배정 결과 ===')
  for (const tn of Object.keys(byTeam).map(Number).sort((a, b) => a - b)) {
    const marker = tn === 1 ? ' ★' : ''
    console.log(`팀 ${tn}${marker}: ${byTeam[tn].join(', ')}`)
  }

  if (!APPLY) {
    console.log('\n[dry-run] 실제 반영하려면 --apply')
    return
  }

  // 기존 team 삭제 + 신규 insert
  const { error: delErr } = await db.from('challenge_teams').delete().eq('challenge_id', ch.id)
  if (delErr) { console.error('delete 실패:', delErr.message); process.exit(1) }

  const rows = assignments.map(a => ({
    challenge_id: ch.id,
    team_num: a.team_num,
    member_nickname: a.member_nickname,
  }))
  const { error: insErr } = await db.from('challenge_teams').insert(rows)
  if (insErr) { console.error('insert 실패:', insErr.message); process.exit(1) }
  console.log(`\n✅ 적용 완료: ${rows.length}명 / ${Object.keys(byTeam).length}팀`)
}

main().catch(e => { console.error(e); process.exit(1) })
