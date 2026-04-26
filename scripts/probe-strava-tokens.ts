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
  // 1. 백화 user_id 가져오기
  const { data: bh } = await db.from('members').select('user_id').eq('strava_athlete_id', 1462511331).limit(1)
  const uid = bh?.[0]?.user_id
  console.log('백화 user_id:', uid)

  // 2. 직접 upsert
  const before = await db.from('strava_tokens').select('*').eq('user_id', uid)
  console.log('upsert 전 row:', before.data?.length || 0)

  const { data: insData, error: insErr, status } = await db.from('strava_tokens').upsert({
    user_id: uid,
    athlete_id: 1462511331,
    access_token: 'PROBE_ACCESS',
    refresh_token: 'PROBE_REFRESH',
    expires_at: 9999999999,
  }, { onConflict: 'user_id' }).select()
  console.log('upsert result:', { insData, insErr: insErr?.message, status })

  // 3. 직후 조회
  const after = await db.from('strava_tokens').select('*').eq('user_id', uid)
  console.log('upsert 직후 row:', after.data?.length || 0, after.data)

  // 4. 5초 후 다시 조회 (혹시 비동기 trigger)
  await new Promise(r => setTimeout(r, 5000))
  const after5s = await db.from('strava_tokens').select('*').eq('user_id', uid)
  console.log('5초 후 row:', after5s.data?.length || 0, after5s.data)
}
main().catch(e => { console.error(e); process.exit(1) })
