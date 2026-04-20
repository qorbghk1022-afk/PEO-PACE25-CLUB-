#!/usr/bin/env npx tsx
/**
 * HRC Q1-2026 draw_results 삭제 — 재추첨 가능하게 리셋
 * Dry-run: npx tsx scripts/reset-hrc-q1-draw.ts
 * Apply:   npx tsx scripts/reset-hrc-q1-draw.ts --apply
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: existing } = await db.from('draw_results').select('*')
    .eq('crew_id', HRC).eq('quarter', 'Q1-2026').order('rank')
  console.log(`HRC Q1-2026 기존 추첨결과: ${existing?.length || 0}건`)
  for (const r of (existing || [])) {
    console.log(`  ${r.rank}등: ${r.winner_nickname} (${r.prize}, ticket=${r.ticket_count})`)
  }
  if (!APPLY) { console.log('\n[dry-run] --apply 시 위 결과 전부 삭제됩니다'); return }
  const { error } = await db.from('draw_results').delete()
    .eq('crew_id', HRC).eq('quarter', 'Q1-2026')
  if (error) { console.error('삭제 실패:', error.message); process.exit(1) }
  console.log('\n✅ 삭제 완료. UI에서 재추첨 가능')
}
main().catch(e => { console.error(e); process.exit(1) })
