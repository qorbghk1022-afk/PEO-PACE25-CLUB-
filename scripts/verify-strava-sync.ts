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
  const { data, count } = await db.from('activities')
    .select('strava_activity_id, member_nickname, date, distance_km', { count: 'exact' })
    .not('strava_activity_id', 'is', null)
    .order('date', { ascending: false }).limit(30)
  console.log(`strava_activity_id 박힌 활동: ${count || 0}건\n최근 30건:`)
  for (const r of (data || [])) {
    console.log(`  ${r.date} | ${r.member_nickname} | ${r.distance_km}km | id=${r.strava_activity_id}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
