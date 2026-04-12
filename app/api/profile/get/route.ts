import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifySession } from '@/lib/auth'

function decrypt(encoded: string): string {
  try {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
    const buf = Buffer.from(encoded, 'base64')
    const iv = buf.subarray(0, 16)
    const tag = buf.subarray(16, 32)
    const enc = buf.subarray(32)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(enc) + decipher.final('utf8')
  } catch {
    return '***'
  }
}

export async function GET(req: NextRequest) {
  const { userId: sessionUserId, error: authError } = await verifySession(req)
  if (authError || !sessionUserId) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  // Users can only access their own profile
  const userId = sessionUserId

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('member_profiles')
    .select('real_name, phone_enc, address_enc')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ real_name: '', phone: '', address: '' })

  const phone = data.phone_enc ? decrypt(data.phone_enc) : ''
  const address = data.address_enc ? decrypt(data.address_enc) : ''

  return NextResponse.json({
    real_name: data.real_name || '',
    phone: phone === '***' ? '(복호화 실패 - 다시 입력해주세요)' : phone,
    address: address === '***' ? '(복호화 실패 - 다시 입력해주세요)' : address,
  })
}
