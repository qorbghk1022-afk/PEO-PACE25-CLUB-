#!/usr/bin/env npx tsx
/**
 * 특정 activity row 직접 삭제 (시트에서 지웠는데 DB에 남은 경우)
 * Usage: npx tsx scripts/delete-activity.ts <nickname> <date> [distance_km] [--apply]
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
  const nickname = process.argv[2]
  const date = process.argv[3]
  const distArg = process.argv.find((a, i) => i > 3 && !a.startsWith('--') && !isNaN(Number(a)))
  const APPLY = process.argv.includes('--apply')
  if (!nickname || !date) { console.error('usage: <nickname> <date> [distance_km] [--apply]'); process.exit(1) }

  let q = db.from('activities').select('*').eq('member_nickname', nickname).eq('date', date)
  if (distArg) q = q.eq('distance_km', Number(distArg))
  const { data } = await q
  if (!data || data.length === 0) { console.error('매칭 없음'); process.exit(1) }
  console.log(`매칭 ${data.length}건:`)
  for (const r of data) {
    console.log(`  ${r.member_nickname} | ${r.date} | ${r.distance_km}km | crew=${r.crew_id?.slice(0,8) || 'NULL'} | id=${r.id}`)
  }
  if (!APPLY) { console.log('\n[dry-run] --apply 시 모두 삭제'); return }
  const ids = data.map(r => r.id)
  const { error } = await db.from('activities').delete().in('id', ids)
  if (error) { console.error(error.message); process.exit(1) }
  console.log(`✅ ${ids.length}건 삭제 완료`)
}
main().catch(e => { console.error(e); process.exit(1) })
