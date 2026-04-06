import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifySession(req)
  if (authError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 크루장 확인
  const { data: crew } = await admin.from('crews').select('id').eq('leader_user_id', userId).maybeSingle()
  if (!crew) return NextResponse.json({ error: '크루장 권한이 없습니다' }, { status: 403 })

  const { action, nickname, leave_start, leave_end, leave_reason, remark } = await req.json()

  if (action === 'set_leave') {
    await admin.from('members').update({ leave_start, leave_end, leave_reason }).eq('nickname', nickname).eq('crew_id', crew.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear_leave') {
    await admin.from('members').update({ leave_start: null, leave_end: null, leave_reason: null }).eq('nickname', nickname).eq('crew_id', crew.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'set_remark') {
    await admin.from('members').update({ remark }).eq('nickname', nickname).eq('crew_id', crew.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'kick') {
    await admin.from('crew_members').delete().eq('crew_id', crew.id).eq('member_nickname', nickname)
    await admin.from('members').update({ crew_id: null }).eq('nickname', nickname)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 })
}
