/**
 * POST /api/sync-sheet
 * Google Apps Script에서 호출 — 스프레드시트 데이터를 Supabase에 동기화
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // 시크릿 키 인증
  const secret = req.headers.get('x-sync-secret')
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { members, season_stats, challenge, season } = body

    const results: Record<string, unknown> = {}

    // 1. members 테이블 업데이트 (lv, total_dist, total_days)
    if (members?.length) {
      for (const m of members) {
        const { error } = await supabaseAdmin
          .from('members')
          .update({
            lv: m.lv,
            total_dist: m.total_dist,
            total_days: m.total_days,
            total_exp: m.total_exp ?? m.lv * 100,
          })
          .eq('nickname', m.nickname)
        if (error) console.warn('member update error:', m.nickname, error.message)
      }
      results.members = `${members.length}명 업데이트`
    }

    // 2. 시즌 upsert
    let seasonId: string | null = null
    if (season) {
      const { data: upserted, error } = await supabaseAdmin
        .from('seasons')
        .upsert({
          generation: season.generation,
          start_date: season.start_date,
          end_date: season.end_date,
          is_current: true,
        }, { onConflict: 'generation' })
        .select('id')
        .single()
      if (!error && upserted) {
        seasonId = upserted.id
        // 나머지 시즌은 is_current = false
        await supabaseAdmin
          .from('seasons')
          .update({ is_current: false })
          .neq('id', seasonId)
        results.season = `시즌 ${season.generation}기 업서트`
      }
    }

    // 3. member_season_stats 업서트 (능력치 + 기록)
    if (season_stats?.length && seasonId) {
      const rows = season_stats.map((s: Record<string, unknown>) => ({
        season_id: seasonId,
        member_nickname: s.nickname,
        distance_km: s.distance_km ?? 0,
        longest_run_km: s.longest_run_km ?? 0,
        avg_pace_sec: s.avg_pace_sec ?? 0,
        days_run: s.days_run ?? 0,
        speed_score: s.speed_score ?? 0,
        endurance_score: s.endurance_score ?? 0,
        longrun_score: s.longrun_score ?? 0,
        consistency_score: s.consistency_score ?? 0,
        efficiency_score: s.efficiency_score ?? 0,
        total_score: s.total_score ?? 0,
      }))
      const { error } = await supabaseAdmin
        .from('member_season_stats')
        .upsert(rows, { onConflict: 'season_id,member_nickname' })
      if (error) console.warn('season_stats upsert error:', error.message)
      else results.season_stats = `${rows.length}개 능력치 업서트`
    }

    // 4. 챌린지 upsert
    if (challenge && seasonId) {
      const { error } = await supabaseAdmin
        .from('challenges')
        .upsert({
          season_id: seasonId,
          goal_km: challenge.goal_km,
          fine_per_km: challenge.fine_per_km ?? 3000,
          start_date: challenge.start_date,
          end_date: challenge.end_date,
        }, { onConflict: 'season_id' })
      if (error) console.warn('challenge upsert error:', error.message)
      else results.challenge = '챌린지 업서트'
    }

    return NextResponse.json({ ok: true, results })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '서버 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
