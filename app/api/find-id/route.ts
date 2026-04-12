import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { nickname, realname } = await req.json()

    if (!nickname?.trim() || !realname?.trim()) {
      return NextResponse.json(
        { error: '닉네임과 실명을 모두 입력해주세요' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Query members table for matching nickname
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('user_id, nickname')
      .eq('nickname', nickname.trim())
      .maybeSingle()

    if (memberErr) {
      return NextResponse.json({ error: '조회 중 오류가 발생했습니다' }, { status: 500 })
    }

    if (!member || !member.user_id) {
      return NextResponse.json(
        { error: '일치하는 계정을 찾을 수 없습니다' },
        { status: 404 }
      )
    }

    // Check realname in member_profiles
    const { data: profile } = await supabase
      .from('member_profiles')
      .select('real_name')
      .eq('user_id', member.user_id)
      .maybeSingle()

    if (!profile || profile.real_name !== realname.trim()) {
      return NextResponse.json(
        { error: '일치하는 계정을 찾을 수 없습니다' },
        { status: 404 }
      )
    }

    // Get email from auth.users using admin API
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(member.user_id)

    if (authErr || !authData?.user?.email) {
      return NextResponse.json(
        { error: '이메일 정보를 조회할 수 없습니다' },
        { status: 500 }
      )
    }

    const email = authData.user.email
    const atIdx = email.indexOf('@')
    const local = email.substring(0, atIdx)
    const domain = email.substring(atIdx)

    // Mask email: first 3 chars + ** + last 2 chars before @ + domain
    let masked: string
    if (local.length <= 5) {
      // Short email: show first 2 + ** + domain
      masked = local.substring(0, 2) + '**' + domain
    } else {
      masked = local.substring(0, 3) + '**' + local.substring(local.length - 2) + domain
    }

    return NextResponse.json({ email: masked })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
