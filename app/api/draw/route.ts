import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const quarter = req.nextUrl.searchParams.get('quarter') || 'Q1-2026'
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('draw_results').select('*').eq('quarter', quarter).order('rank')
  return NextResponse.json({ results: data || [] })
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quarter } = await req.json()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 이미 추첨된 분기인지 확인
  const { data: existing } = await admin.from('draw_results').select('id').eq('quarter', quarter).limit(1)
  if (existing && existing.length > 0) {
    const { data } = await admin.from('draw_results').select('*').eq('quarter', quarter).order('rank')
    return NextResponse.json({ results: data })
  }

  // 추첨권 가져오기
  const { data: members } = await admin.from('members').select('nickname, lottery_tickets').gt('lottery_tickets', 0)
  if (!members || members.length === 0) return NextResponse.json({ error: '추첨권이 없습니다' }, { status: 400 })

  // 추첨 풀
  const pool: string[] = []
  members.forEach(m => { for (let i = 0; i < m.lottery_tickets; i++) pool.push(m.nickname) })

  // 상품 (1등 1명, 2등 1명, 3등 3명)
  const prizes = [
    { rank: 1, prize: '러닝화 (~20만원)' },
    { rank: 2, prize: '5만원 상품권' },
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
    // 당첨자 모든 티켓 제거
    for (let j = remaining.length - 1; j >= 0; j--) {
      if (remaining[j] === winner) remaining.splice(j, 1)
    }
    results.push({ quarter, rank: p.rank, prize: p.prize, winner_nickname: winner, ticket_count: tickets })
  }

  // DB 저장
  await admin.from('draw_results').insert(results)

  return NextResponse.json({ results })
}
