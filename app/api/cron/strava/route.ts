/**
 * GET /api/cron/strava
 * Strava catch-up 전용 cron.
 * 내부적으로 /api/strava/sync (POST)를 호출. 병렬 처리 + 동시성 제한 적용됨.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const log: string[] = []

  try {
    const res = await fetch(`${baseUrl}/api/strava/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    })
    const data = await res.json()
    log.push(`synced=${data.synced ?? 0} users=${data.users ?? 0}`)

    await db.from('sync_logs').insert({
      activity_count: data.synced ?? 0,
      status: res.ok ? 'success' : 'error',
      message: `[strava] ${log.join(' | ')}`,
    })

    return NextResponse.json({ success: res.ok, ...data, log })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.push(`ERROR: ${msg}`)
    await db.from('sync_logs').insert({ activity_count: 0, status: 'error', message: `[strava] ${log.join(' | ')}` })
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
