#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const HRC = '2891fdd5-545b-4144-81f6-229df8dd5457'
const PEO = '0bb28fad-31df-493b-a883-fda564836a64'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // members.strava_athlete_id 채워진 사람
  const { data: linked } = await db.from('members')
    .select('nickname, crew_id, strava_athlete_id, user_id')
    .not('strava_athlete_id', 'is', null)
  console.log(`members.strava_athlete_id 있는 멤버: ${linked?.length || 0}명`)
  for (const m of (linked || [])) {
    const crew = m.crew_id === HRC ? 'HRC' : m.crew_id === PEO ? 'PEO' : '?'
    console.log(`  [${crew}] ${m.nickname} → athlete_id=${m.strava_athlete_id} user=${m.user_id?.slice(0,8) || 'NULL'}`)
  }

  // strava_tokens 테이블
  const { data: tokens } = await db.from('strava_tokens').select('user_id, athlete_id, expires_at, scope')
  console.log(`\nstrava_tokens row: ${tokens?.length || 0}건`)
  for (const t of (tokens || [])) {
    console.log(`  user=${t.user_id?.slice(0,8)} athlete=${t.athlete_id} scope=${t.scope} exp=${t.expires_at}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
