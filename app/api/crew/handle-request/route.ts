import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { userId, requestId, action } = await req.json()
  if (!userId || !requestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 가입 신청 조회
  const { data: request } = await admin.from('crew_join_requests')
    .select('*').eq('id', requestId).eq('status', 'pending').single()
  if (!request) return NextResponse.json({ error: '신청을 찾을 수 없습니다' }, { status: 404 })

  // 크루장 권한 확인
  const { data: crew } = await admin.from('crews').select('id, leader_user_id').eq('id', request.crew_id).single()
  if (!crew || crew.leader_user_id !== userId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  if (action === 'approve') {
    // 정원 체크
    const { count } = await admin.from('crew_members').select('id', { count: 'exact', head: true }).eq('crew_id', crew.id)
    const { data: crewData } = await admin.from('crews').select('max_members').eq('id', crew.id).single()
    if ((count || 0) >= (crewData?.max_members || 30)) {
      return NextResponse.json({ error: '크루 정원이 찼습니다' }, { status: 409 })
    }

    // 크루 멤버 등록
    await admin.from('crew_members').insert({
      crew_id: crew.id, user_id: request.user_id,
      member_nickname: request.member_nickname, role: 'member'
    })
    await admin.from('members').update({ crew_id: crew.id }).eq('user_id', request.user_id)

    // 신청 상태 업데이트
    await admin.from('crew_join_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', requestId)

    // 신청자에게 알림
    await admin.from('notifications').insert({
      user_id: request.user_id, type: 'join_approved',
      title: '크루 가입이 승인되었습니다!',
      metadata: { crew_id: crew.id }
    })
  } else {
    await admin.from('crew_join_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', requestId)
    await admin.from('notifications').insert({
      user_id: request.user_id, type: 'join_rejected',
      title: '크루 가입이 거절되었습니다',
      metadata: { crew_id: crew.id }
    })
  }

  return NextResponse.json({ success: true })
}
