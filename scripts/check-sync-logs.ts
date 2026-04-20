#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('sync_logs')
    .select('synced_at, status, activity_count, message')
    .order('synced_at', { ascending: false })
    .limit(30)
  for (const r of (data || [])) {
    console.log(`${r.synced_at} [${r.status}] count=${r.activity_count}`)
    console.log(`  ${String(r.message).slice(0, 180)}\n`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
