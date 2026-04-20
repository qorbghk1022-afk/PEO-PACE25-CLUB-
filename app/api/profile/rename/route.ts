/**
 * POST /api/profile/rename
 * 닉네임 변경 + 관련 테이블 cascade 업데이트
 * - members.nickname
 * - activities.member_nickname
 * - challenge_teams.member_nickname
 * - draw_results.winner_nickname
 *
 * nickname을 FK로 쓰는 구조적 한계 보완. orphan 방지용.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

const BANNED = ['시발','씨발','병신','지랄','개새끼','fuck','shit','bitch','asshole','nigger','sex','섹스','야동','porn','죽어','살인']

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { newNickname } = await req.json()
  const trimmed = String(newNickname ?? '').trim()
  if (!trimmed) return NextResponse.json({ error: '닉네임이 비어있습니다' }, { status: 400 })
  if (BANNED.some(w => trimmed.toLowerCase().includes(w))) {
    return NextResponse.json({ error: '사용할 수 없는 닉네임이에요' }, { status: 400 })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 세션 유저의 member row — 멀티크루면 여러 건, 닉은 동일. 첫 row로 현재 닉 확인
  const { data: myMembers } = await admin.from('members')
    .select('id, nickname, crew_id').eq('user_id', userId)
  if (!myMembers || myMembers.length === 0) {
    return NextResponse.json({ error: '멤버 정보 없음' }, { status: 404 })
  }
  const myMember = myMembers[0]

  const oldNickname = myMember.nickname
  if (oldNickname === trimmed) return NextResponse.json({ ok: true, message: '동일 닉네임' })

  // 중복 체크: 같은 닉이 다른 user_id로 존재하는지 (전체 크루 대상)
  const { data: dup } = await admin.from('members')
    .select('id, user_id').eq('nickname', trimmed).limit(5)
  const conflict = (dup || []).some(r => r.id !== myMember.id && r.user_id !== userId)
  if (conflict) return NextResponse.json({ error: '이미 사용 중인 닉네임이에요' }, { status: 409 })

  // cascade 업데이트 (원자적이진 않지만 best-effort)
  const updates = {
    members: 0,
    activities: 0,
    challenge_teams: 0,
    draw_results: 0,
  }

  // 1. members — 동일 user_id의 모든 row (멀티크루 대응)
  const { count: mc } = await admin.from('members')
    .update({ nickname: trimmed }, { count: 'exact' })
    .eq('user_id', userId)
  updates.members = mc || 0

  // 2. activities — oldNickname 전부
  const { count: ac } = await admin.from('activities')
    .update({ member_nickname: trimmed }, { count: 'exact' })
    .eq('member_nickname', oldNickname)
  updates.activities = ac || 0

  // 3. challenge_teams
  const { count: cc } = await admin.from('challenge_teams')
    .update({ member_nickname: trimmed }, { count: 'exact' })
    .eq('member_nickname', oldNickname)
  updates.challenge_teams = cc || 0

  // 4. draw_results (winner_nickname)
  const { count: dc } = await admin.from('draw_results')
    .update({ winner_nickname: trimmed }, { count: 'exact' })
    .eq('winner_nickname', oldNickname)
  updates.draw_results = dc || 0

  return NextResponse.json({ ok: true, oldNickname, newNickname: trimmed, updates })
}
