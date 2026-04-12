import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId: sessionUserId, error: authError } = await verifySession(req)
    if (authError || !sessionUserId) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
    }

    const { nickname, realName, phone, address, privacyAgreed, stravaAgreed } = await req.json()
    const userId = sessionUserId

    if (!nickname) {
      return NextResponse.json({ error: 'nickname이 필요해요' }, { status: 400 })
    }

    // members 테이블 — 기존 row 있으면 user_id 연결, 없으면 신규 삽입
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('id, user_id')
      .eq('nickname', nickname)
      .maybeSingle()

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('members')
        .update({ user_id: userId, is_active: true })
        .eq('nickname', nickname)
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('members')
        .insert({ nickname, user_id: userId, egg_type: 'star', egg_config: {}, is_active: true })
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // 개인정보 저장 (평문)
    if (realName || phone || address) {
      const now = new Date().toISOString()
      await supabaseAdmin.from('member_profiles').upsert({
        user_id: userId,
        real_name: realName || null,
        phone: phone || null,
        address: address || null,
        privacy_agreed_at: privacyAgreed ? now : null,
        strava_agreed_at: stravaAgreed ? now : null,
      }, { onConflict: 'user_id' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '서버 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
