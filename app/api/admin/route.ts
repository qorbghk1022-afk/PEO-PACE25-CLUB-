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

  const body = await req.json()
  const { action, crew_id, challenge_dates, session_dates, fines } = body

  if (action === 'sync_tickets') {
    if (!crew_id || !challenge_dates || !session_dates) {
      return NextResponse.json({ error: 'crew_id, challenge_dates, session_dates 필요' }, { status: 400 })
    }

    const { data: mems } = await admin.from('members').select('nickname').eq('crew_id', crew_id)
    if (!mems) return NextResponse.json({ error: '멤버 조회 실패' }, { status: 500 })

    const results: { nickname: string; tickets: number }[] = []

    for (const m of mems) {
      let tickets = 0

      for (const ch of challenge_dates) {
        if (new Date(ch.start) > new Date()) continue
        const { data: acts } = await admin.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).gte('date', ch.start).lte('date', ch.end)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets++
      }

      for (const sd of session_dates) {
        if (new Date(sd) > new Date()) continue
        const { data: acts } = await admin.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).eq('date', sd)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets += 2
      }

      results.push({ nickname: m.nickname, tickets })
      await admin.from('members').update({ lottery_tickets: tickets }).eq('nickname', m.nickname)
    }

    return NextResponse.json({ ok: true, results })
  }

  if (action === 'create_fines') {
    if (!fines || !Array.isArray(fines) || fines.length === 0) {
      return NextResponse.json({ error: '벌금 데이터가 없습니다' }, { status: 400 })
    }
    const { error } = await admin.from('payments').insert(fines)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: fines.length })
  }

  if (action === 'update_payment') {
    const { payment_id, status } = body
    if (!payment_id || !status) return NextResponse.json({ error: 'payment_id, status 필요' }, { status: 400 })
    const { error } = await admin.from('payments').update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null }).eq('id', payment_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete_crew') {
    if (!crew_id) return NextResponse.json({ error: 'crew_id 필요' }, { status: 400 })

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
