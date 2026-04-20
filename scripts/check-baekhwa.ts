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
  const { data } = await db.from('activities')
    .select('id, date, distance_km, crew_id, activity_name')
    .eq('member_nickname', '백화')
    .order('date', { ascending: false })
    .limit(30)
  console.log(`백화 활동 (전체 크루, 최근 30건):`)
  for (const a of (data || [])) {
    const crewLabel = a.crew_id === PEO ? 'PEO' : a.crew_id ? 'HRC' : 'NULL'
    console.log(`  [${crewLabel}] ${a.date} | ${a.distance_km}km | ${a.activity_name || ''} | id=${a.id.slice(0,8)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
