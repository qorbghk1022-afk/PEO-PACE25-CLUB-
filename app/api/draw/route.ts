import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'
import { QUARTERS } from '@/lib/quarters'

const ADMIN_EMAILS = ['a5214275@naver.com']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeQuarterPool(
  admin: any,
  quarterName: string,
  crewId: string,
): Promise<Array<{ nickname: string; lottery_tickets: number }>> {
  const q = QUARTERS.find(x => x.name === quarterName)
  if (!q) return []

  const { data: mems } = await admin.from('members').select('nickname').eq('crew_id', crewId)
  const members = (mems || []) as Array<{ nickname: string }>
  if (members.length === 0) return []

  // crew_id 필터: 해당 크루 활동 + Strava(NULL)만 카운트
  const { data: acts } = await admin
    .from('activities')
    .select('member_nickname, date, distance_km')
    .gte('date', q.start).lte('date', q.end)
    .or(`crew_id.eq.${crewId},crew_id.is.null`)
  const actsList = (acts || []) as Array<{ member_nickname: string; date: string; distance_km: number }>

  const manual = q.manualSessions ?? {}
  const pool: Array<{ nickname: string; lottery_tickets: number }> = []
  const GOAL = 15

  for (const m of members) {
    let t = 0
    for (const cp of q.challengeDates) {
      const total = actsList
        .filter(a => a.member_nickname === m.nickname && a.date >= cp.start && a.date <= cp.end)
        .reduce((s, a) => s + Number(a.distance_km), 0)
      if (total >= GOAL) t++
    }
    for (const sd of q.sessionDates) {
      if (manual[sd]?.includes(m.nickname)) { t += 2; continue }
      const total = actsList
        .filter(a => a.member_nickname === m.nickname && a.date === sd)
        .reduce((s, a) => s + Number(a.distance_km), 0)
      if (total >= GOAL) t += 2
    }
    if (t > 0) pool.push({ nickname: m.nickname, lottery_tickets: t })
  }
  return pool
}

export async function GET(req: NextRequest) {
  const quarter = req.nextUrl.searchParams.get('quarter') || 'Q1-2026'
  const crewId = req.nextUrl.searchParams.get('crew_id')
  if (!crewId) return NextResponse.json({ error: 'crew_id 필요' }, { status: 400 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('draw_results').select('*')
    .eq('quarter', quarter).eq('crew_id', crewId).order('rank')
  return NextResponse.json({ results: data || [] })
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quarter, force, crew_id } = await req.json()
  if (!crew_id) return NextResponse.json({ error: 'crew_id 필요' }, { status: 400 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  let members: Array<{ nickname: string; lottery_tickets: number }> | null = null

  if (force) {
    const { data: { user: sessionUser } } = await admin.auth.admin.getUserById(userId)
    if (!sessionUser || !ADMIN_EMAILS.includes(sessionUser.email || '')) {
      return NextResponse.json({ error: '재추첨은 관리자만 가능합니다' }, { status: 403 })
    }
    await admin.from('draw_results').delete().eq('quarter', quarter).eq('crew_id', crew_id)
  } else {
    // 이미 추첨된 (quarter+crew) 있으면 기존 결과 반환
    const { data: existing } = await admin.from('draw_results').select('id')
      .eq('quarter', quarter).eq('crew_id', crew_id).limit(1)
    if (existing && existing.length > 0) {
      const { data } = await admin.from('draw_results').select('*')
        .eq('quarter', quarter).eq('crew_id', crew_id).order('rank')
      return NextResponse.json({ results: data })
    }
  }

  // 항상 QUARTERS 설정 + activities 기반으로 분기 풀 계산
  // (DB members.lottery_tickets는 현재 분기만 반영해서 과거 분기 추첨엔 부적합)
  members = await computeQuarterPool(admin, quarter, crew_id)

  if (!members || members.length === 0) return NextResponse.json({ error: '추첨권이 없습니다' }, { status: 400 })

  const pool: string[] = []
  members.forEach(m => { for (let i = 0; i < m.lottery_tickets; i++) pool.push(m.nickname) })

  const prizes = [
    { rank: 1, prize: '러닝화 (~20만원)' },
    { rank: 2, prize: '3만원 상품권' },
    { rank: 3, prize: '1만원 기프티콘' },
    { rank: 4, prize: '1만원 기프티콘' },
    { rank: 5, prize: '1만원 기프티콘' },
  ]

  const remaining = [...pool]
  const results = []

  for (const p of prizes) {
    if (remaining.length === 0) break
    const idx = Math.floor(Math.random() * remaining.length)
    const winner = remaining[idx]
    const tickets = members.find(m => m.nickname === winner)?.lottery_tickets || 0
    for (let j = remaining.length - 1; j >= 0; j--) {
      if (remaining[j] === winner) remaining.splice(j, 1)
    }
    results.push({
      quarter, crew_id,
      rank: p.rank, prize: p.prize,
      winner_nickname: winner, ticket_count: tickets,
    })
  }

  await admin.from('draw_results').insert(results)

  const drawPoolNicks = Array.from(new Set(members.map(m => m.nickname)))
  if (drawPoolNicks.length > 0) {
    await admin.from('members')
      .update({ lottery_tickets: 0 })
      .eq('crew_id', crew_id)
      .in('nickname', drawPoolNicks)
  }

  return NextResponse.json({ results })
}
