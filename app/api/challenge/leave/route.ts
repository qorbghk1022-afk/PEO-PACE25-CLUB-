import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { nickname, challengeId, reason, reasonDetail, leaveStart, leaveEnd } = await req.json()
  if (!nickname || !challengeId || !reason) return NextResponse.json({ error: '필수 정보 누락' }, { status: 400 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 챌린지 시작 7일 경과 체크
  const { data: challenge } = await admin.from('challenges').select('start_date').eq('id', challengeId).single()
  if (!challenge) return NextResponse.json({ error: '챌린지를 찾을 수 없습니다' }, { status: 404 })

  const daysSinceStart = Math.floor((Date.now() - new Date(challenge.start_date).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceStart > 7) return NextResponse.json({ error: '챌린지 시작 7일 이후에는 중단 신청이 불가합니다' }, { status: 400 })

  // 중복 신청 체크
  const { data: existing } = await admin.from('challenge_leaves')
    .select('id').eq('member_nickname', nickname).eq('challenge_id', challengeId).eq('status', 'pending').maybeSingle()
  if (existing) return NextResponse.json({ error: '이미 중단 신청 중입니다' }, { status: 409 })

  // 신청 생성
  const { data: leave } = await admin.from('challenge_leaves').insert({
    member_nickname: nickname, challenge_id: challengeId,
    reason, reason_detail: reasonDetail || null, status: 'pending'
  }).select('id').single()

  // 크루장에게 알림
  const { data: crewMember } = await admin.from('crew_members').select('crew_id').eq('member_nickname', nickname).limit(1).single()
  if (crewMember) {
    const { data: crew } = await admin.from('crews').select('leader_user_id').eq('id', crewMember.crew_id).single()
    if (crew) {
      await admin.from('notifications').insert({
        user_id: crew.leader_user_id, type: 'challenge_leave',
        title: `${nickname}님이 챌린지 중단을 신청했습니다 (사유: ${reason}, ${leaveStart || ''}~${leaveEnd || ''})`,
        metadata: { leave_id: leave?.id, member_nickname: nickname, reason, leaveStart, leaveEnd }
      })
    }
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leaveId, action } = await req.json()
  if (!leaveId || !['approve', 'reject'].includes(action)) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 신청 데이터 가져오기
  const { data: leaveData } = await admin.from('challenge_leaves').select('*, notifications!inner(metadata)').eq('id', leaveId).maybeSingle()

  await admin.from('challenge_leaves').update({
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: userId, reviewed_at: new Date().toISOString()
  }).eq('id', leaveId)

  // 승인 시 members에 leave 기간 설정
  if (action === 'approve' && leaveData) {
    const nick = leaveData.member_nickname
    const reason = leaveData.reason
    // 알림 메타데이터에서 날짜 가져오기, 없으면 챌린지 기간 사용
    const { data: challenge } = await admin.from('challenges').select('start_date, end_date').eq('id', leaveData.challenge_id).single()
    const start = challenge?.start_date
    const end = challenge?.end_date
    if (nick && start && end) {
      await admin.from('members').update({ leave_start: start, leave_end: end, leave_reason: reason }).eq('nickname', nick)
    }
  }

  return NextResponse.json({ success: true })
}
