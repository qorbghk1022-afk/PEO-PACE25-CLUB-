import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: '유저 ID 없음' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 개인정보 파기 (CASCADE로 member_profiles도 삭제됨)
  // members 테이블에서 user_id만 null 처리 (기록은 유지)
  await admin.from('members').update({ user_id: null }).eq('user_id', userId)

  // auth 계정 삭제 (member_profiles는 ON DELETE CASCADE로 자동 삭제)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
