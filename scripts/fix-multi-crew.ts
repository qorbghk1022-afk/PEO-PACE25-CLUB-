#!/usr/bin/env npx tsx
/**
 * scripts/fix-multi-crew.ts — 백화/머룬 activities.crew_id PEO→HRC 보정
 *
 * fix-data.ts가 중복 제거 시 created_at 기준으로 keep했는데,
 * 백화·머룬의 경우 PEO row가 먼저 만들어져 PEO로 keep되어 HRC 챌린지 집계에서 빠짐.
 * 실제 활동은 HRC 시트에만 기록되므로 HRC가 올바른 분류.
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
const HRC = '2891fdd5-545b-4144-81f6-229df8dd5457'
const PEO = '0bb28fad-31df-493b-a883-fda564836a64'
const TARGETS = ['백화', '머룬']

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  console.log(`MODE: ${APPLY ? '🔴 APPLY' : '🟢 DRY-RUN'}`)

  for (const nick of TARGETS) {
    const { data: rows } = await db.from('activities')
      .select('id, date, distance_km, crew_id')
      .eq('member_nickname', nick)
      .eq('crew_id', PEO)
    console.log(`\n${nick}: PEO crew_id activities ${rows?.length ?? 0}건`)
    if (!rows || rows.length === 0) continue

    if (!APPLY) {
      console.log(`  샘플 5건: ${rows.slice(0, 5).map(r => `${r.date} ${r.distance_km}km`).join(', ')}`)
      continue
    }

    const ids = rows.map(r => r.id)
    const batch = 100
    let done = 0
    for (let i = 0; i < ids.length; i += batch) {
      const { error } = await db.from('activities')
        .update({ crew_id: HRC })
        .in('id', ids.slice(i, i + batch))
      if (error) { console.error('  err:', error.message); throw error }
      done += Math.min(batch, ids.length - i)
    }
    console.log(`  ✅ ${nick}: ${done}건 PEO → HRC`)
  }

  console.log(`\nDONE`)
}

main().catch(e => { console.error(e); process.exit(1) })
