import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId 필요' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin.from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notifications: data })
}

export async function PATCH(req: NextRequest) {
  const { userId, notificationIds } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId 필요' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (notificationIds) {
    await admin.from('notifications').update({ is_read: true }).in('id', notificationIds).eq('user_id', userId)
  } else {
    await admin.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
  }

  return NextResponse.json({ success: true })
}
