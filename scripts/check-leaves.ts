#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const HRC = '2891fdd5-545b-4144-81f6-229df8dd5457'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db.from('members')
    .select('nickname, leave_start, leave_end, leave_reason, is_active')
    .eq('crew_id', HRC)
    .not('leave_start', 'is', null)
    .order('leave_start')
  console.log(`HRC 중 leave_start 설정된 멤버: ${data?.length || 0}명 (today=${today})\n`)
  for (const m of (data || [])) {
    const isPast = (m.leave_end || '') < today
    console.log(`  ${m.nickname}: ${m.leave_start} ~ ${m.leave_end} (${m.leave_reason}) ${isPast ? '⚪ 종료됨' : '🟢 진행중'} active=${m.is_active}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
