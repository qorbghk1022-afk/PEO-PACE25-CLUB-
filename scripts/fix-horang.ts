#!/usr/bin/env npx tsx
/**
 * challenge_teams의 "호랑90" → "호랑" 업데이트
 * Dry-run: npx tsx scripts/fix-horang.ts
 * Apply:   npx tsx scripts/fix-horang.ts --apply
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const APPLY = process.argv.includes('--apply')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: before } = await db.from('challenge_teams')
    .select('challenge_id, team_num, member_nickname').eq('member_nickname', '호랑90')
  console.log(`대상: ${before?.length || 0}건`)
  for (const t of (before || [])) {
    console.log(`  ch=${t.challenge_id.slice(0,8)} team=${t.team_num}`)
  }
  if (!APPLY) { console.log('[dry-run] --apply 시 호랑90 → 호랑'); return }
  const { error } = await db.from('challenge_teams')
    .update({ member_nickname: '호랑' }).eq('member_nickname', '호랑90')
  if (error) { console.error(error.message); process.exit(1) }
  console.log(`✅ ${before?.length || 0}건 업데이트 완료 (호랑90 → 호랑)`)
}
main().catch(e => { console.error(e); process.exit(1) })
