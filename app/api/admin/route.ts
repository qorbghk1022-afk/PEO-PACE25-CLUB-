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

  const { action, crew_id } = await req.json()

  if (action === 'delete_crew') {
    if (!crew_id) return NextResponse.json({ error: 'crew_id 필요' }, { status: 400 })

    // 관련 데이터 모두 삭제 (순서 중요)
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
