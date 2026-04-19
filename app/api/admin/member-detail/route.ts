import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

const ADMIN_EMAILS = ['a5214275@naver.com']

function maskName(name: string | null): string | null {
  if (!name) return null
  const n = name.trim()
  if (n.length <= 1) return n
  if (n.length === 2) return n[0] + '*'
  if (n.length === 3) return n[0] + '*' + n[2]
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return phone
  const prefix = digits.slice(0, 3)
  const last = digits.slice(-4)
  return phone.includes('-') ? `${prefix}-****-${last}` : `${prefix}****${last}`
}

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at <= 0) return email
  return email[0] + '***' + email.slice(at)
}

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url)
  const nickname = url.searchParams.get('nickname')
  const unmask = url.searchParams.get('unmask') === '1'

  if (!nickname) {
    return NextResponse.json({ error: 'nickname 필요' }, { status: 400 })
  }

  const { data: member } = await admin
    .from('members')
    .select('nickname, realname, user_id, crew_id, lv, total_dist, total_days, lottery_tickets, remark, leave_start, leave_end, leave_reason, created_at')
    .eq('nickname', nickname)
    .maybeSingle()
  if (!member) {
    return NextResponse.json({ error: '회원을 찾을 수 없습니다' }, { status: 404 })
  }

  let crewName: string | null = null
  if (member.crew_id) {
    const { data: crew } = await admin.from('crews').select('name').eq('id', member.crew_id).maybeSingle()
    crewName = crew?.name ?? null
  }

  let stravaConnected = false
  let realName: string | null = member.realname ?? null
  let phone: string | null = null
  let email: string | null = null

  if (member.user_id) {
    const [{ data: st }, { data: profile }, { data: authUserData }] = await Promise.all([
      admin.from('strava_tokens').select('id').eq('user_id', member.user_id).maybeSingle(),
      admin.from('member_profiles').select('real_name, phone').eq('user_id', member.user_id).maybeSingle(),
      admin.auth.admin.getUserById(member.user_id),
    ])
    stravaConnected = !!st
    if (profile) {
      realName = profile.real_name ?? realName
      phone = profile.phone ?? null
    }
    email = authUserData?.user?.email ?? null
  }

  return NextResponse.json({
    nickname: member.nickname,
    crew_name: crewName,
    strava_connected: stravaConnected,
    real_name: unmask ? realName : maskName(realName),
    phone: unmask ? phone : maskPhone(phone),
    email: unmask ? email : maskEmail(email),
    joined_at: member.created_at,
    lv: member.lv,
    total_dist: member.total_dist,
    total_days: member.total_days,
    lottery_tickets: member.lottery_tickets,
    remark: member.remark,
    leave_start: member.leave_start,
    leave_end: member.leave_end,
    leave_reason: member.leave_reason,
    linked: !!member.user_id,
    masked: !unmask,
  })
}
