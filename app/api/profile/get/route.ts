import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { userId: sessionUserId, error: authError } = await verifySession(req)
  if (authError || !sessionUserId) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const userId = sessionUserId

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('member_profiles')
    .select('real_name, phone, address')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ real_name: '', phone: '', address: '' })

  return NextResponse.json({
    real_name: data.real_name || '',
    phone: data.phone || '',
    address: data.address || '',
  })
}
