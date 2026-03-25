import { NextResponse } from 'next/server'

// Vercel Cron: 14:00 UTC = 23:00 KST 매일 스트라바 동기화
// vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 14 * * *" }] }
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/strava/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    })
    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
