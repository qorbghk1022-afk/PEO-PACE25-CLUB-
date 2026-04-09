import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // Verify auth via Supabase JWT
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  )
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { nickname } = await req.json()
  if (!nickname) {
    return NextResponse.json({ error: 'nickname required' }, { status: 400 })
  }

  // Verify user owns this nickname
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: member } = await serviceClient
    .from('members')
    .select('nickname')
    .eq('user_id', user.id)
    .eq('nickname', nickname)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete activities where strava_activity_id IS NOT NULL for this member
  const { data: deleted, error: delErr } = await serviceClient
    .from('activities')
    .delete()
    .eq('member_nickname', nickname)
    .not('strava_activity_id', 'is', null)
    .select('id')

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: deleted?.length ?? 0 })
}
