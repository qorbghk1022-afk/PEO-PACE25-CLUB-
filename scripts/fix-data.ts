#!/usr/bin/env npx tsx
/**
 * scripts/fix-data.ts — 프로덕션 DB 데이터 정리 스크립트
 *
 * Fix A: activities 중복 288건 제거 ((HRC, NULL) 쌍 / (HRC, HRC) / (NULL, NULL))
 * Fix E: NULL 단독 12건 → HRC crew_id 할당
 * Fix B: members.total_dist, total_days 재계산
 *
 * 사용법:
 *   npx tsx scripts/fix-data.ts           # dry-run (기본)
 *   npx tsx scripts/fix-data.ts --apply   # 실제 적용
 *
 * 안전장치:
 *   - 기본은 dry-run (읽기만, 변경 사항 출력)
 *   - --apply 플래그 줘야 실제 DB 쓰기
 *   - 모든 작업 begin/end 로그
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// .env.local 로드
const envPath = path.join(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const APPLY = process.argv.includes('--apply')
const HRC = '2891fdd5-545b-4144-81f6-229df8dd5457'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function fetchAllActivities() {
  const all: Array<{
    id: string; member_nickname: string; date: string;
    distance_km: number; crew_id: string | null; created_at: string;
  }> = []
  let offset = 0
  while (true) {
    const { data, error } = await db
      .from('activities')
      .select('id, member_nickname, date, distance_km, crew_id, created_at')
      .order('created_at')
      .range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function main() {
  console.log('─'.repeat(60))
  console.log(`MODE: ${APPLY ? '🔴 APPLY (실제 적용)' : '🟢 DRY-RUN (읽기만)'}`)
  console.log(`START: ${new Date().toISOString()}`)
  console.log('─'.repeat(60))

  // ─── 1. 활동 전체 가져와서 중복 분석 ───
  console.log('\n[1] 활동 전체 로드 중...')
  const acts = await fetchAllActivities()
  console.log(`   총 ${acts.length}건`)

  // ─── 2. 중복 그룹 식별 ───
  const groups = new Map<string, typeof acts>()
  for (const a of acts) {
    const key = `${a.member_nickname}|${a.date}|${Number(a.distance_km).toFixed(2)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  const toDelete: string[] = []
  for (const rows of groups.values()) {
    if (rows.length <= 1) continue
    // 우선순위: crew_id NOT NULL > NULL. 동일한 경우 created_at 오래된 것 keep
    rows.sort((x, y) => {
      const ax = x.crew_id === null ? 1 : 0
      const ay = y.crew_id === null ? 1 : 0
      if (ax !== ay) return ax - ay
      return x.created_at.localeCompare(y.created_at)
    })
    // 첫 번째 keep, 나머지 delete
    for (let i = 1; i < rows.length; i++) toDelete.push(rows[i].id)
  }
  console.log(`   중복 그룹 ${[...groups.values()].filter(v => v.length > 1).length}개 → 삭제 대상 ${toDelete.length}건`)

  // ─── 3. NULL 단독 활동 식별 ───
  const nullSolo = [...groups.values()].filter(v => v.length === 1 && v[0].crew_id === null).map(v => v[0])
  const targetNicks = new Set(['런징', '멀루', '순현', '양봉', '연', '익런'])
  const nullToUpdate = nullSolo.filter(a => targetNicks.has(a.member_nickname))
  console.log(`   NULL 단독 활동: ${nullSolo.length}건 (HRC 할당 대상 ${nullToUpdate.length}건)`)
  if (nullToUpdate.length > 0 && nullToUpdate.length <= 20) {
    console.log('   대상:')
    for (const a of nullToUpdate) {
      console.log(`     ${a.date} ${a.member_nickname} ${a.distance_km}km id=${a.id.slice(0, 8)}`)
    }
  }

  // ─── 4. 실행 ───
  if (!APPLY) {
    console.log('\n✅ DRY-RUN 완료. 실제 적용하려면 --apply 플래그 사용.')
    console.log(`\n예상 결과:`)
    console.log(`   activities: ${acts.length} → ${acts.length - toDelete.length} (-${toDelete.length})`)
    console.log(`   NULL crew_id: ${acts.filter(a => a.crew_id === null).length} → ${acts.filter(a => a.crew_id === null).length - toDelete.filter(id => acts.find(a => a.id === id)?.crew_id === null).length - nullToUpdate.length}`)
    return
  }

  // ─── Fix A: 중복 삭제 (배치) ───
  console.log('\n[2] Fix A: 중복 activities 삭제 실행...')
  const batchSize = 50
  let deletedCount = 0
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize)
    const { error } = await db.from('activities').delete().in('id', batch)
    if (error) {
      console.error(`   배치 ${i / batchSize + 1} 실패: ${error.message}`)
      throw error
    }
    deletedCount += batch.length
    console.log(`   진행: ${deletedCount}/${toDelete.length}`)
  }
  console.log(`   ✅ 삭제 완료: ${deletedCount}건`)

  // ─── Fix E: NULL → HRC 업데이트 ───
  console.log('\n[3] Fix E: NULL 단독 활동 HRC 할당...')
  const nullIds = nullToUpdate.map(a => a.id)
  if (nullIds.length > 0) {
    const { error } = await db.from('activities').update({ crew_id: HRC }).in('id', nullIds)
    if (error) throw error
    console.log(`   ✅ 업데이트 완료: ${nullIds.length}건`)
  }

  // ─── Fix B: total_dist / total_days 재계산 ───
  console.log('\n[4] Fix B: members.total_dist/total_days 재계산...')
  const { data: mems } = await db.from('members').select('nickname').not('user_id', 'is', null)
  if (!mems) throw new Error('members 조회 실패')

  // 삭제 반영된 activities 다시 로드
  const acts2 = await fetchAllActivities()
  const statsByNick = new Map<string, { dist: number; days: Set<string> }>()
  for (const a of acts2) {
    if (!statsByNick.has(a.member_nickname)) statsByNick.set(a.member_nickname, { dist: 0, days: new Set() })
    const s = statsByNick.get(a.member_nickname)!
    s.dist += Number(a.distance_km)
    s.days.add(a.date)
  }

  let updated = 0
  for (const m of mems) {
    const s = statsByNick.get(m.nickname) || { dist: 0, days: new Set() }
    const total_dist = Math.round(s.dist * 100) / 100
    const total_days = s.days.size
    const { error } = await db.from('members')
      .update({ total_dist, total_days })
      .eq('nickname', m.nickname)
    if (error) {
      console.error(`   ${m.nickname} 실패: ${error.message}`)
      continue
    }
    updated++
  }
  console.log(`   ✅ 재계산 완료: ${updated}명`)

  // ─── 최종 검증 ───
  console.log('\n[5] 검증')
  const { count: afterCount } = await db.from('activities').select('id', { count: 'exact', head: true })
  const { count: nullCount } = await db.from('activities').select('id', { count: 'exact', head: true }).is('crew_id', null)
  console.log(`   activities 총: ${afterCount}`)
  console.log(`   NULL crew_id 남음: ${nullCount}`)

  console.log('\n─'.repeat(60))
  console.log(`DONE: ${new Date().toISOString()}`)
}

main().catch(e => {
  console.error('ERROR:', e)
  process.exit(1)
})
