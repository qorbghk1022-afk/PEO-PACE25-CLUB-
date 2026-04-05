import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const { crewId, nickname } = await req.json()
  if (!crewId) return NextResponse.json({ error: '필수 정보 누락' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 이미 이 크루에 속해있는지 (같은 크루 중복 가입만 방지)
  const { data: alreadyIn } = await admin.from('crew_members').select('id').eq('user_id', userId).eq('crew_id', crewId).maybeSingle()
  if (alreadyIn) return NextResponse.json({ error: '이미 이 크루에 소속되어 있습니다' }, { status: 409 })

  // 크루 정원 체크
  const { data: crew } = await admin.from('crews').select('id, max_members, leader_user_id').eq('id', crewId).single()
  if (!crew) return NextResponse.json({ error: '크루를 찾을 수 없습니다' }, { status: 404 })
  const { count } = await admin.from('crew_members').select('id', { count: 'exact', head: true }).eq('crew_id', crewId)
  if ((count || 0) >= crew.max_members) return NextResponse.json({ error: '크루 정원이 찼습니다' }, { status: 409 })

  // 중복 신청 체크
  const { data: pendingReq } = await admin.from('crew_join_requests')
    .select('id').eq('crew_id', crewId).eq('user_id', userId).eq('status', 'pending').maybeSingle()
  if (pendingReq) return NextResponse.json({ error: '이미 가입 신청 중입니다' }, { status: 409 })

  // 가입 신청
  await admin.from('crew_join_requests').insert({
    crew_id: crewId, user_id: userId, member_nickname: nickname || null, status: 'pending'
  })

  // 크루장에게 알림
  await admin.from('notifications').insert({
    user_id: crew.leader_user_id,
    type: 'join_request',
    title: `${nickname || '새 멤버'}님이 크루 가입을 신청했습니다`,
    metadata: { crew_id: crewId, requester_user_id: userId, requester_nickname: nickname }
  })

  return NextResponse.json({ success: true })
}
