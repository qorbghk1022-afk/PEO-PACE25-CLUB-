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
  // 1. strava_activity_id 컬럼 존재 + 데이터 확인
  const { data: sample } = await db.from('activities').select('id, strava_activity_id, member_nickname, date').not('strava_activity_id', 'is', null).limit(5)
  console.log(`strava_activity_id 있는 row: ${sample?.length || 0}건`)
  for (const r of (sample || [])) {
    console.log(`  ${r.strava_activity_id} | ${r.member_nickname} | ${r.date}`)
  }

  // 2. UNIQUE 제약 테스트: 같은 strava_activity_id 두 번 insert 시도
  const fakeId = 9999999999
  console.log('\nUNIQUE 제약 테스트...')
  await db.from('activities').delete().eq('strava_activity_id', fakeId)

  const { error: e1 } = await db.from('activities').insert({
    strava_activity_id: fakeId, member_nickname: '__test__', date: '2026-01-01', distance_km: 1,
    sport_type: 'Run', crew_id: null,
  })
  console.log('  1차 insert:', e1?.message || 'OK')

  const { error: e2 } = await db.from('activities').insert({
    strava_activity_id: fakeId, member_nickname: '__test__', date: '2026-01-02', distance_km: 2,
    sport_type: 'Run', crew_id: null,
  })
  if (e2 && e2.message.includes('duplicate')) {
    console.log('  2차 insert: ✅ UNIQUE 제약 작동 (dup 차단)')
  } else if (e2) {
    console.log('  2차 insert error:', e2.message)
  } else {
    console.log('  2차 insert: ⚠️ UNIQUE 제약 없음 (중복 허용됨)')
  }

  // 3. cleanup
  await db.from('activities').delete().eq('strava_activity_id', fakeId)
  console.log('\ncleanup OK')
}
main().catch(e => { console.error(e); process.exit(1) })
