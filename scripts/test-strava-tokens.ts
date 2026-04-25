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
  // 백화 user_id (a2c031bf...) 의 풀 UUID 가져오기
  const { data: bh } = await db.from('members').select('user_id').eq('strava_athlete_id', 1462511331).limit(1)
  const testUserId = bh?.[0]?.user_id
  if (!testUserId) { console.log('백화 user_id 없음'); return }
  console.log(`테스트 user_id: ${testUserId}`)
  const { error } = await db.from('strava_tokens').upsert({
    user_id: testUserId,
    athlete_id: 999,
    access_token: 'test',
    refresh_token: 'test',
    expires_at: 9999999999,
  }, { onConflict: 'user_id' })
  if (error) { console.log('❌ insert 실패:', error.message); return }
  console.log('✅ strava_tokens 테이블 정상 (insert 성공)')
  await db.from('strava_tokens').delete().eq('user_id', testUserId)

  // 컬럼 정보 확인용 빈 select
  const { data, error: e2 } = await db.from('strava_tokens').select('*').limit(1)
  console.log('\nselect:', e2?.message || `현재 ${data?.length || 0}건`)
}
main().catch(e => { console.error(e); process.exit(1) })
