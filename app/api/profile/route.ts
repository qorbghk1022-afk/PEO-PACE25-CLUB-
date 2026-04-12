import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { userId: sessionUserId, error: authError } = await verifySession(req)
  if (authError || !sessionUserId) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const { realName, phone, address, privacyAgreed, stravaAgreed } = await req.json()
  const userId = sessionUserId

  if (!privacyAgreed) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin.from('member_profiles').upsert({
    user_id: userId,
    real_name: realName || null,
    phone: phone || null,
    address: address || null,
    privacy_agreed_at: privacyAgreed ? new Date().toISOString() : null,
    strava_agreed_at: stravaAgreed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
