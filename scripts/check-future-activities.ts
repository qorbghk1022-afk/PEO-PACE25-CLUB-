#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const PEO = '0bb28fad-31df-493b-a883-fda564836a64'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  console.log('Today:', today)
  // 모든 미래 날짜 활동 (today 이후)
  const { data: future } = await db.from('activities')
    .select('member_nickname, date, distance_km, crew_id')
    .gt('date', today)
    .order('date')
  console.log(`\n미래 날짜 활동 (${today} 이후): ${future?.length || 0}건`)
  for (const a of (future || [])) {
    console.log(`  ${a.date} | ${a.member_nickname} | ${a.distance_km}km | crew=${a.crew_id?.slice(0,8) || 'NULL'}`)
  }
  // 특히 2026-05-09 (Q2 첫 세션일)
  const { data: may9 } = await db.from('activities')
    .select('member_nickname, distance_km, crew_id')
    .eq('date', '2026-05-09')
  console.log(`\n2026-05-09 활동: ${may9?.length || 0}건`)
  for (const a of (may9 || [])) {
    console.log(`  ${a.member_nickname} | ${a.distance_km}km | crew=${a.crew_id?.slice(0,8) || 'NULL'}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
