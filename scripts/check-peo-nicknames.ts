#!/usr/bin/env npx tsx
/**
 * PEO 시트 닉네임 vs DB 멤버 양방향 비교
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const PEO = '0bb28fad-31df-493b-a883-fda564836a64'
const SHEET_ID = '1gdEsbzlsIoqo0lEsM3b23VJqsNZwZRW48Z3GATpgaIM'
const PEO_GID = 9257927
const NICKNAME_FIXES: Record<string, string> = {
  '원': '진원', '키가케인던스': '키가케이던스', '키카케이던스': '키가케이던스',
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function parseCSV(text: string): string[][] {
  return text.split('\n').map(line => {
    const out: string[] = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') q = false
        else cur += c
      } else {
        if (c === '"') q = true
        else if (c === ',') { out.push(cur); cur = '' }
        else cur += c
      }
    }
    out.push(cur.replace(/\r$/, ''))
    return out
  }).filter(r => r.some(c => c.trim() !== ''))
}

async function main() {
  // 1. DB 멤버
  const { data: mems } = await db.from('members').select('nickname').eq('crew_id', PEO)
  const dbNicks = new Set((mems || []).map(m => m.nickname))
  console.log(`DB PEO 멤버: ${dbNicks.size}명`)

  // 2. 시트 닉네임
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PEO_GID}`)
  const csv = await res.text()
  const rows = parseCSV(csv)
  const header = rows[0]
  const nickIdx = header.findIndex(h => h.includes('회원'))
  const sheetNicks = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    let n = (rows[i][nickIdx] || '').trim()
    if (NICKNAME_FIXES[n]) n = NICKNAME_FIXES[n]
    if (n) sheetNicks.add(n)
  }
  console.log(`시트 활동 닉네임: ${sheetNicks.size}종`)

  // 3. 양방향 diff
  const onlySheet = [...sheetNicks].filter(n => !dbNicks.has(n)).sort()
  const onlyDb = [...dbNicks].filter(n => !sheetNicks.has(n)).sort()

  console.log('\n=== 시트엔 있는데 DB엔 없음 (오타/미등록) ===')
  if (onlySheet.length === 0) console.log('(없음) ✅')
  else onlySheet.forEach(n => console.log(`  ❌ ${n}`))

  console.log('\n=== DB엔 있는데 시트엔 기록 없음 (활동無 or 유령) ===')
  if (onlyDb.length === 0) console.log('(없음)')
  else onlyDb.forEach(n => console.log(`  · ${n}`))
}

main().catch(e => { console.error(e); process.exit(1) })
