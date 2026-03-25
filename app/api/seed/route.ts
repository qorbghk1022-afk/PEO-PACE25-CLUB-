/**
 * POST /api/seed  (Authorization 필요)
 * GET  /api/seed  (임시 — 시딩 완료 후 삭제 예정)
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parsePaceStr, parseTimeStr } from '@/lib/scoring'
import rawData from '@/peo_raw_data.json'

const MEMBERS_SEED = [
  { nickname: '순현', egg_type: 'star' }, { nickname: '양봉', egg_type: 'cloud' },
  { nickname: '재형', egg_type: 'moon' }, { nickname: '혀노', egg_type: 'heart' },
  { nickname: '뽀기아빠', egg_type: 'sun' }, { nickname: '런징', egg_type: 'star' },
  { nickname: 'HappyAI', egg_type: 'cloud' }, { nickname: '멀루', egg_type: 'moon' },
  { nickname: '키가케이던스', egg_type: 'heart' }, { nickname: '경민', egg_type: 'sun' },
  { nickname: 'JM', egg_type: 'star' }, { nickname: '키키키', egg_type: 'cloud' },
  { nickname: '머룬', egg_type: 'moon' }, { nickname: '연', egg_type: 'heart' },
  { nickname: '익런', egg_type: 'sun' }, { nickname: '백화', egg_type: 'star' },
  { nickname: '네모러너', egg_type: 'cloud' }, { nickname: '제로', egg_type: 'moon' },
  { nickname: '갤러리킴', egg_type: 'heart' }, { nickname: '배당의민족', egg_type: 'sun' },
  { nickname: 'SJ', egg_type: 'star' }, { nickname: '꾸마', egg_type: 'cloud' },
  { nickname: '부개동러너', egg_type: 'moon' }, { nickname: '진원', egg_type: 'heart' },
  { nickname: '스응민', egg_type: 'sun' }, { nickname: '원', egg_type: 'star' },
  { nickname: '찬우', egg_type: 'cloud' },
]

async function runSeed() {
  const db = createServiceClient()

  // 1. 회원 시드
  await db.from('members').upsert(
    MEMBERS_SEED.map(m => ({ ...m, is_active: true })),
    { onConflict: 'nickname', ignoreDuplicates: true }
  )

  // 2. 시즌 생성
  let { data: season } = await db.from('seasons').select('id').eq('generation', 1).single()
  if (!season) {
    const { data: newSeason } = await db.from('seasons')
      .insert({ generation: 1, start_date: '2025-12-01', end_date: '2026-06-30', is_current: true })
      .select('id').single()
    season = newSeason
  }

  // 3. peo_raw_data.json 활동 임포트
  const rows = (rawData as string[][]).slice(1)
  const activitiesToInsert = rows.map(row => {
    const dateStr = row[0]
    const nickname = row[1]
    const distKm = parseFloat(row[2]) || 0
    const movingSec = parseTimeStr(row[4])
    const avgPaceSec = parsePaceStr(row[5])
    return {
      member_nickname: nickname,
      date: dateStr,
      distance_km: distKm,
      moving_time_sec: movingSec,
      elapsed_time_sec: movingSec,
      avg_pace_sec: avgPaceSec,
      efficiency: 1.0,
      sport_type: 'Run',
      activity_name: '러닝',
    }
  }).filter(a => a.member_nickname && a.distance_km > 0 && a.date)

  let imported = 0
  for (let i = 0; i < activitiesToInsert.length; i += 100) {
    const batch = activitiesToInsert.slice(i, i + 100)
    const { error } = await db.from('activities').insert(batch)
    if (!error) imported += batch.length
  }

  return { members: MEMBERS_SEED.length, activities: imported }
}

export async function GET() {
  try {
    const result = await runSeed()
    return NextResponse.json({
      success: true,
      ...result,
      message: `회원 ${result.members}명, 활동 ${result.activities}개 임포트 완료`,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runSeed()
    return NextResponse.json({
      success: true,
      ...result,
      message: `회원 ${result.members}명, 활동 ${result.activities}개 임포트 완료`,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
