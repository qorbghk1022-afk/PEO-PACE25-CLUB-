import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: '이메일을 입력해주세요' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 이메일로 유저 찾기
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) return NextResponse.json({ error: '서버 오류' }, { status: 500 })

  const user = users.find(u => u.email === email)
  if (!user) return NextResponse.json({ error: '해당 이메일로 가입된 계정이 없습니다' }, { status: 404 })

  // 임시 비밀번호 생성 (8자리 랜덤)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$'
  let tempPw = ''
  for (let i = 0; i < 8; i++) tempPw += chars[Math.floor(Math.random() * chars.length)]
  // 규칙 충족 보장
  tempPw = 'peo' + tempPw + '1!'

  // 비밀번호 변경
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password: tempPw })
  if (updateErr) return NextResponse.json({ error: '비밀번호 변경 실패' }, { status: 500 })

  return NextResponse.json({ tempPassword: tempPw })
}
