/**
 * GET /api/import-sprints
 * GitHub data/ 폴더의 회원2주능력치데이터.csv를 읽어서 DB에 임포트
 * - 2주 단위 seasons 레코드 생성
 * - member_season_stats 업서트
 * - 누적 km × 페이스계수 기반 LV 재계산
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calcSpeedScore, calcEnduranceScore, calcLongRunScore, calcConsistencyScore, calcLv } from '@/lib/scoring'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim())
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow)
      currentRow = []
      currentCell = ''
    } else if (char === '\r') {
      // skip
    } else {
      currentCell += char
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow)
  }
  return rows
}

function parseKoreanDate(dateStr: string): string | null {
  // "2026. 3. 23" → "2026-03-23"
  const match = dateStr.trim().match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function parsePaceToSec(paceStr: string): number {
  // "05:33" → 333초
  if (!paceStr || paceStr === '00:00') return 0
  const parts = paceStr.trim().split(':')
  if (parts.length !== 2) return 0
  const min = parseInt(parts[0])
  const sec = parseInt(parts[1])
  if (isNaN(min) || isNaN(sec)) return 0
  return min * 60 + sec
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const fileName = encodeURIComponent('회원2주능력치데이터.csv')
    const csvUrl = `https://raw.githubusercontent.com/qorbghk1022-afk/PEO-PACE25-CLUB-/main/data/${fileName}`

    const resp = await fetch(csvUrl, { cache: 'no-store' })
    if (!resp.ok) throw new Error(`CSV 다운로드 실패: ${resp.status}`)
    const text = await resp.text()

    const allRows = parseCSV(text)

    // 날짜 형식이 맞는 행만 데이터 행으로 인식
    const dataRows = allRows.filter(row =>
      row.length >= 18 && parseKoreanDate(row[2]) !== null
    )

    if (dataRows.length === 0) throw new Error('파싱된 데이터가 없음')

    const db = createServiceClient()

    // 파싱
    const parsedRows: Array<{
      nickname: string
      startDate: string
      endDate: string
      distKm: number
      longestKm: number
      paceSec: number
      daysRun: number
      cadenceScore: number
      isCurrent: boolean
    }> = []

    const sprintMap = new Map<string, { start: string; end: string; isCurrent: boolean }>()

    for (const row of dataRows) {
      const nickname = row[0].trim()
      if (!nickname) continue
      const startDate = parseKoreanDate(row[2])
      const endDate = parseKoreanDate(row[3])
      if (!startDate || !endDate) continue

      const distKm = parseFloat(row[4]) || 0
      const longestKm = parseFloat(row[5]) || 0
      const paceSec = parsePaceToSec(row[6])
      const daysRun = parseInt(row[7]) || 0
      const cadenceScore = parseFloat(row[15]) || 0  // 케이던스 점수 → efficiency_score로 저장
      const status = (row[18] || '').trim()
      const isCurrent = status === '현재시즌'

      const key = `${startDate}_${endDate}`
      const existing = sprintMap.get(key)
      sprintMap.set(key, {
        start: startDate,
        end: endDate,
        isCurrent: (existing?.isCurrent ?? false) || isCurrent,
      })

      parsedRows.push({ nickname, startDate, endDate, distKm, longestKm, paceSec, daysRun, cadenceScore, isCurrent })
    }

    // 기존 is_current 초기화
    await db.from('seasons').update({ is_current: false }).eq('is_current', true)

    // 시즌 생성/조회
    const seasonIdMap = new Map<string, string>()
    for (const [key, sprint] of sprintMap) {
      const { data: existing } = await db.from('seasons')
        .select('id')
        .eq('start_date', sprint.start)
        .eq('end_date', sprint.end)
        .maybeSingle()

      if (existing) {
        seasonIdMap.set(key, existing.id)
        if (sprint.isCurrent) {
          await db.from('seasons').update({ is_current: true }).eq('id', existing.id)
        }
      } else {
        const gen = sprint.start >= '2026-01-20' ? 2 : 1
        const { data: newSeason } = await db.from('seasons').insert({
          start_date: sprint.start,
          end_date: sprint.end,
          is_current: sprint.isCurrent,
          generation: gen,
        }).select('id').single()
        if (newSeason) seasonIdMap.set(key, newSeason.id)
      }
    }

    // member_season_stats 업서트
    let statsUpdated = 0
    for (const row of parsedRows) {
      const key = `${row.startDate}_${row.endDate}`
      const seasonId = seasonIdMap.get(key)
      if (!seasonId) continue

      const speed = calcSpeedScore(row.paceSec)
      const endurance = calcEnduranceScore(row.distKm)
      const longRun = calcLongRunScore(row.longestKm)
      const consistency = calcConsistencyScore(row.daysRun)
      const efficiencyScore = row.cadenceScore  // 케이던스 점수를 efficiency_score로 사용
      const total = speed * 0.3 + endurance * 0.25 + longRun * 0.15 + consistency * 0.2 + efficiencyScore * 0.1

      await db.from('member_season_stats').upsert({
        member_nickname: row.nickname,
        season_id: seasonId,
        distance_km: row.distKm,
        longest_run_km: row.longestKm,
        avg_pace_sec: row.paceSec,
        days_run: row.daysRun,
        efficiency: 1.0,
        speed_score: speed,
        endurance_score: endurance,
        longrun_score: longRun,
        consistency_score: consistency,
        efficiency_score: efficiencyScore,
        total_score: total,
      }, { onConflict: 'member_nickname,season_id' })

      statsUpdated++
    }

    // 멤버별 누적 LV 계산
    const memberCumMap = new Map<string, { cumKm: number; paces: number[]; totalDays: number }>()
    for (const row of parsedRows) {
      if (!memberCumMap.has(row.nickname)) {
        memberCumMap.set(row.nickname, { cumKm: 0, paces: [], totalDays: 0 })
      }
      const m = memberCumMap.get(row.nickname)!
      m.cumKm += row.distKm
      if (row.paceSec > 0) m.paces.push(row.paceSec)
      m.totalDays += row.daysRun
    }

    let membersUpdated = 0
    const lvResults: Record<string, number> = {}
    for (const [nickname, { cumKm, paces, totalDays }] of memberCumMap) {
      const avgPace = paces.length > 0
        ? Math.round(paces.reduce((a, b) => a + b) / paces.length)
        : 0
      const lv = calcLv(cumKm, avgPace)
      lvResults[nickname] = lv

      const { error } = await db.from('members').update({
        total_dist: Math.round(cumKm * 100) / 100,
        total_days: totalDays,
        lv,
      }).eq('nickname', nickname)

      if (!error) membersUpdated++
    }

    return NextResponse.json({
      success: true,
      sprints: sprintMap.size,
      statsUpdated,
      membersUpdated,
      lvResults,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
