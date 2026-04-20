#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  console.log('=== members (ilike %호랑%) ===')
  const { data: mems } = await db.from('members').select('*').ilike('nickname', '%호랑%')
  for (const m of (mems || [])) {
    console.log(`  "${m.nickname}" crew=${m.crew_id?.slice(0,8)} active=${m.is_active} created=${m.created_at}`)
  }

  console.log('\n=== activities (ilike %호랑%) — 최근 10건 ===')
  const { data: acts } = await db.from('activities').select('member_nickname, date, distance_km, crew_id')
    .ilike('member_nickname', '%호랑%').order('date', { ascending: false }).limit(10)
  for (const a of (acts || [])) {
    console.log(`  "${a.member_nickname}" ${a.date} ${a.distance_km}km crew=${a.crew_id?.slice(0,8) || 'NULL'}`)
  }

  console.log('\n=== challenge_teams (ilike %호랑%) ===')
  const { data: cts } = await db.from('challenge_teams').select('challenge_id, team_num, member_nickname').ilike('member_nickname', '%호랑%')
  for (const t of (cts || [])) {
    console.log(`  "${t.member_nickname}" team=${t.team_num} ch=${t.challenge_id.slice(0,8)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
