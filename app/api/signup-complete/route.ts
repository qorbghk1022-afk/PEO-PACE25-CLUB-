import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function encrypt(text: string): string {
  const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export async function POST(req: NextRequest) {
  try {
    const { userId, nickname, realName, phone, address, privacyAgreed, stravaAgreed } = await req.json()

    if (!userId || !nickname) {
      return NextResponse.json({ error: 'userId와 nickname이 필요해요' }, { status: 400 })
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
        .insert({ nickname, user_id: userId, egg_type: 'star', is_active: true })
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // 개인정보 암호화 저장
    if (realName || phone || address) {
      const encPhone = phone ? encrypt(phone) : null
      const encAddress = address ? encrypt(address) : null
      await supabaseAdmin.from('member_profiles').upsert({
        user_id: userId,
        real_name: realName || null,
        phone_encrypted: encPhone,
        address_encrypted: encAddress,
        privacy_agreed: privacyAgreed,
        strava_agreed: stravaAgreed,
      }, { onConflict: 'user_id' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '서버 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
