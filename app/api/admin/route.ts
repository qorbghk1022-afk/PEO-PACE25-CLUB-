import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'
import { QUARTERS } from '@/lib/quarters'

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

    const crewFilter = `crew_id.eq.${crew_id},crew_id.is.null`
    const results: { nickname: string; tickets: number }[] = []

    for (const m of mems) {
      let tickets = 0

      for (const ch of challenge_dates) {
        if (new Date(ch.start) > new Date()) continue
        const { data: acts } = await admin.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).gte('date', ch.start).lte('date', ch.end)
          .or(crewFilter)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets++
      }

      for (const sd of session_dates) {
        if (new Date(sd) > new Date()) continue
        const { data: acts } = await admin.from('activities').select('distance_km')
          .eq('member_nickname', m.nickname).eq('date', sd)
          .or(crewFilter)
        const total = (acts || []).reduce((s: number, a: { distance_km: number }) => s + Number(a.distance_km), 0)
        if (total >= 15) tickets += 2
      }

      results.push({ nickname: m.nickname, tickets })
      await admin.from('members').update({ lottery_tickets: tickets })
        .eq('nickname', m.nickname).eq('crew_id', crew_id)
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

  if (action === 'create_challenge') {
    const { start_date, end_date, goal_km, fine_per_km, season_id } = body
    if (!crew_id || !start_date || !end_date) {
      return NextResponse.json({ error: 'crew_id, start_date, end_date 필요' }, { status: 400 })
    }
    const { data: existing } = await admin.from('challenges')
      .select('id').eq('crew_id', crew_id).eq('start_date', start_date).maybeSingle()
    if (existing) return NextResponse.json({ error: '이미 해당 시작일로 챌린지가 있습니다' }, { status: 409 })

    const { data, error } = await admin.from('challenges').insert({
      crew_id, season_id: season_id || null,
      start_date, end_date,
      goal_km: Number(goal_km) || 15,
      fine_per_km: Number(fine_per_km) || 3000,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, challenge: data })
  }

  if (action === 'auto_create_quarter_challenges') {
    const { quarter_name, season_id, goal_km, fine_per_km } = body
    if (!crew_id) return NextResponse.json({ error: 'crew_id 필요' }, { status: 400 })

    const q = quarter_name
      ? QUARTERS.find(x => x.name === quarter_name)
      : QUARTERS[0]
    if (!q) return NextResponse.json({ error: '분기를 찾을 수 없습니다' }, { status: 404 })

    const { data: existing } = await admin.from('challenges')
      .select('start_date').eq('crew_id', crew_id)
      .gte('start_date', q.start).lte('end_date', q.end)
    const existingStarts = new Set((existing || []).map(r => r.start_date))

    const rows = q.challengeDates
      .filter(cd => !existingStarts.has(cd.start))
      .map(cd => ({
        crew_id,
        season_id: season_id || null,
        start_date: cd.start,
        end_date: cd.end,
        goal_km: Number(goal_km) || 15,
        fine_per_km: Number(fine_per_km) || 3000,
      }))

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, created: 0, skipped: q.challengeDates.length, quarter: q.name })
    }
    const { error } = await admin.from('challenges').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true, created: rows.length, skipped: q.challengeDates.length - rows.length, quarter: q.name,
    })
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
