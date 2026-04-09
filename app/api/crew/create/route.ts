import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const { nickname, name, description, imageUrl, color } = await req.json()
  if (!name) return NextResponse.json({ error: '필수 정보 누락' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 크루 생성 자격 확인 (누적 1000km 이상)
  const { data: memberData } = await admin.from('members').select('total_dist').eq('user_id', userId).maybeSingle()
  if (!memberData || (memberData.total_dist || 0) < 1000) {
    return NextResponse.json({ error: '크루 생성은 누적 1,000km 이상 달린 러너만 가능합니다' }, { status: 403 })
  }

  // 이름 중복 체크
  const { data: existing } = await admin.from('crews').select('id').eq('name', name).maybeSingle()
  if (existing) return NextResponse.json({ error: '이미 존재하는 크루명입니다' }, { status: 409 })

  // 1인 1크루 생성 제한
  const { data: alreadyLeader } = await admin.from('crews').select('id').eq('leader_user_id', userId).maybeSingle()
  if (alreadyLeader) return NextResponse.json({ error: '크루는 한 개만 만들 수 있습니다' }, { status: 409 })
  // if (alreadyLeader) return NextResponse.json({ error: '크루는 한 개만 만들 수 있습니다' }, { status: 409 })

  // 크루 생성
  const { data: crew, error: crewErr } = await admin.from('crews').insert({
    name, description: description || null, leader_user_id: userId,
    image_url: imageUrl || null, color: color || null
  }).select().single()
  if (crewErr) return NextResponse.json({ error: crewErr.message }, { status: 500 })

  // 크루 멤버로 등록 (leader)
  await admin.from('crew_members').insert({
    crew_id: crew.id, user_id: userId, member_nickname: nickname || null, role: 'leader'
  })

  // members 테이블에 crew_id 설정
  if (nickname) {
    await admin.from('members').update({ crew_id: crew.id }).eq('user_id', userId)
  }

  return NextResponse.json({ crew })
}
