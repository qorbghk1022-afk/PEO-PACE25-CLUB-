import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

const ADMIN_EMAILS = ['a5214275@naver.com']

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 어드민 확인
  const { data: { user } } = await admin.auth.admin.getUserById(userId)
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
    return NextResponse.json({ error: '관리자 권한이 없습니다' }, { status: 403 })
  }

  const { action, crew_id, challenge_dates, session_dates } = await req.json()

  if (action === 'sync_tickets') {
    // 모든 멤버의 추첨권을 활동 데이터 기반으로 재계산
    if (!crew_id || !challenge_dates || !session_dates) {
      return NextResponse.json({ error: 'crew_id, challenge_dates, session_dates 필요' }, { status: 400 })
    }

    const { data: mems } = await admin.from('members').select('nickname').eq('crew_id', crew_id)
    if (!mems) return NextResponse.json({ error: '멤버 조회 실패' }, { status: 500 })

    const results: { nickname: string; tickets: number }[] = []

    for (const m of mems) {
      let tickets = 0

      // 챌린지 완주 체크 (각 1장)
      for (const ch of challenge_dates) {
        if (new Date(ch.start) > new Date()) continue
        const { data: acts } = await admin.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).gte('date', ch.start).lte('date', ch.end)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets++
      }

      // 정기세션 체크 (각 2장)
      for (const sd of session_dates) {
        if (new Date(sd) > new Date()) continue
        const { data: acts } = await admin.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).eq('date', sd)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets += 2
      }

      results.push({ nickname: m.nickname, tickets })

      // DB 업데이트
      await admin.from('members').update({ lottery_tickets: tickets }).eq('nickname', m.nickname)
    }

    return NextResponse.json({ ok: true, results })
  }

  if (action === 'delete_crew') {
    if (!crew_id) return NextResponse.json({ error: 'crew_id 필요' }, { status: 400 })

    // 관련 데이터 모두 삭제 (순서 중요)
    const { data: chs } = await admin.from('challenges').select('id').eq('crew_id', crew_id)
    if (chs && chs.length > 0) {
      await admin.from('challenge_teams').delete().in('challenge_id', chs.map(c => c.id))
    }
    await admin.from('challenges').delete().eq('crew_id', crew_id)
    await admin.from('seasons').delete().eq('crew_id', crew_id)
    await admin.from('crew_join_requests').delete().eq('crew_id', crew_id)
    await admin.from('crew_members').delete().eq('crew_id', crew_id)
    await admin.from('members').update({ crew_id: null }).eq('crew_id', crew_id)
    await admin.from('crews').delete().eq('id', crew_id)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 })
}
