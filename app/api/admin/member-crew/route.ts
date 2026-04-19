import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

const ADMIN_EMAILS = ['a5214275@naver.com']

type PersonRow = {
  id: string
  nickname: string
  realname: string | null
  user_id: string | null
  lv: number | null
  total_exp: number | null
  exp_pct: number | null
  total_dist: number | null
  total_days: number | null
  avatar_url: string | null
  egg_type: string | null
  egg_config: unknown
  strava_athlete_id: number | null
  created_at: string | null
}

export async function POST(req: NextRequest) {
  const { userId: sessionUserId, error: authError } = await verifySession(req)
  if (authError || !sessionUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: { user: sessionUser } } = await admin.auth.admin.getUserById(sessionUserId)
  if (!sessionUser || !ADMIN_EMAILS.includes(sessionUser.email || '')) {
    return NextResponse.json({ error: '관리자 권한이 없습니다' }, { status: 403 })
  }

  const { action, nickname, crew_id } = await req.json() as {
    action: 'add' | 'remove'
    nickname: string
    crew_id: string
  }
  if (!action || !nickname || !crew_id) {
    return NextResponse.json({ error: 'action, nickname, crew_id 모두 필요' }, { status: 400 })
  }

  // 같은 닉네임의 모든 row 조회
  const { data: rows } = await admin
    .from('members')
    .select('id, nickname, realname, user_id, crew_id, lv, total_exp, exp_pct, total_dist, total_days, avatar_url, egg_type, egg_config, strava_athlete_id, created_at')
    .eq('nickname', nickname)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 })
  }

  if (action === 'add') {
    // 이미 해당 크루에 있는지
    if (rows.some(r => r.crew_id === crew_id)) {
      return NextResponse.json({ error: '이미 해당 크루에 소속된 회원입니다' }, { status: 400 })
    }

    const source = rows[0] as PersonRow & { crew_id: string | null }
    // NULL crew_id row 있으면 그걸 UPDATE (유령 row 재발 방지)
    const nullRow = rows.find(r => r.crew_id === null) as (PersonRow & { crew_id: string | null }) | undefined
    if (nullRow) {
      const { error: updErr } = await admin.from('members').update({
        crew_id,
        is_active: true,
        lottery_tickets: 0,
        remark: null,
        leave_start: null, leave_end: null, leave_reason: null,
      }).eq('id', nullRow.id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    } else {
      const { error: insErr } = await admin.from('members').insert({
        nickname: source.nickname,
        user_id: source.user_id,
        realname: source.realname,
        lv: source.lv,
        total_exp: source.total_exp,
        exp_pct: source.exp_pct,
        total_dist: source.total_dist,
        total_days: source.total_days,
        avatar_url: source.avatar_url,
        egg_type: source.egg_type ?? 'star',
        egg_config: source.egg_config,
        strava_athlete_id: source.strava_athlete_id,
        crew_id,
        is_active: true,
        lottery_tickets: 0,
        remark: null,
        leave_start: null, leave_end: null, leave_reason: null,
        // 원본 row의 created_at 복사 (챌린지 가입일 필터용 — 신규 row를 과거 멤버처럼 취급)
        created_at: source.created_at,
      })
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // crew_members 정션에도 추가 (중복 방지)
    if (source.user_id) {
      const { data: exJoin } = await admin.from('crew_members').select('id')
        .eq('crew_id', crew_id).eq('user_id', source.user_id).maybeSingle()
      if (!exJoin) {
        await admin.from('crew_members').insert({
          crew_id, user_id: source.user_id, member_nickname: source.nickname, role: 'member',
        })
      }
    }

    return NextResponse.json({ ok: true, action: 'added', crew_id })
  }

  if (action === 'remove') {
    if (rows.length <= 1) {
      return NextResponse.json({ error: '최소 1개 크루는 유지해야 합니다' }, { status: 400 })
    }
    const target = rows.find(r => r.crew_id === crew_id)
    if (!target) {
      return NextResponse.json({ error: '해당 크루에 소속되어 있지 않습니다' }, { status: 404 })
    }

    // members row 삭제 (nickname + crew_id로 정확히 타겟)
    const { error: delErr } = await admin.from('members')
      .delete().eq('nickname', nickname).eq('crew_id', crew_id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    // crew_members 정션 삭제
    if (target.user_id) {
      await admin.from('crew_members')
        .delete().eq('crew_id', crew_id).eq('user_id', target.user_id)
    }

    return NextResponse.json({ ok: true, action: 'removed', crew_id })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
