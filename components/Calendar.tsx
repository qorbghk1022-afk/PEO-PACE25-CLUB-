'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member } from '@/lib/types'
import { formatPace, formatTime, formatDist } from '@/lib/scoring'

interface Activity {
  date: string
  distance_km: number
  avg_pace_sec: number
  moving_time_sec: number
  activity_name: string | null
}

type PeriodType = '1w' | '1m' | '1y' | 'all'

function getWeekRange(offset: number) {
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: monday, end: sunday }
}
function getMonthRange(offset: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start, end }
}
function getYearRange(offset: number) {
  const now = new Date()
  const y = now.getFullYear() + offset
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) }
}
function fmtDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function fmtShort(d: Date) { return `${d.getMonth() + 1}/${d.getDate()}` }

export default function Calendar({
  member, members, onSelectMember
}: {
  member: Member | null
  members: Member[]
  onSelectMember: (m: Member) => void
}) {
  const today = new Date()
  const [period, setPeriod] = useState<PeriodType>('1m')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [periodLabel, setPeriodLabel] = useState('')

  // 캘린더용 (월 뷰)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 기간별 스탯
  const [periodStats, setPeriodStats] = useState({ distance: 0, longest: 0, avgPace: 0, days: 0 })

  // 기간 변경 시 라벨 + 스탯 로드
  useEffect(() => {
    if (!member) return
    let range: { start: Date; end: Date }
    if (period === '1w') range = getWeekRange(periodOffset)
    else if (period === '1m') range = getMonthRange(periodOffset)
    else if (period === '1y') range = getYearRange(periodOffset)
    else range = { start: new Date(2020, 0, 1), end: new Date() }

    if (period === '1w') setPeriodLabel(`${fmtShort(range.start)} ~ ${fmtShort(range.end)}`)
    else if (period === '1m') setPeriodLabel(`${range.start.getFullYear()}년 ${range.start.getMonth() + 1}월`)
    else if (period === '1y') setPeriodLabel(`${range.start.getFullYear()}년`)
    else setPeriodLabel('전체기록')

    // 월 캘린더 동기화
    if (period === '1m') {
      setYear(range.start.getFullYear())
      setMonth(range.start.getMonth() + 1)
    }

    supabase
      .from('activities')
      .select('distance_km, avg_pace_sec, date')
      .eq('member_nickname', member.nickname)
      .gte('date', fmtDate(range.start))
      .lte('date', fmtDate(range.end))
      .then(({ data }) => {
        const acts = data || []
        const distance = acts.reduce((s, a) => s + a.distance_km, 0)
        const longest = acts.length > 0 ? Math.max(...acts.map(a => a.distance_km)) : 0
        const avgPace = acts.length > 0 ? acts.reduce((s, a) => s + a.avg_pace_sec, 0) / acts.length : 0
        const uniqueDays = new Set(acts.map((a: { date: string }) => a.date)).size
        setPeriodStats({ distance, longest, avgPace, days: uniqueDays })
      })
  }, [member, period, periodOffset])

  // 캘린더 활동 로드 (월 뷰)
  useEffect(() => {
    if (!member) return
    setLoading(true)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    supabase
      .from('activities')
      .select('date, distance_km, avg_pace_sec, moving_time_sec, activity_name')
      .eq('member_nickname', member.nickname)
      .gte('date', start)
      .lte('date', end)
      .order('date')
      .then(({ data }) => {
        setActivities((data as Activity[]) || [])
        setLoading(false)
      })
  }, [member, year, month])

  if (!member) return <div className="empty-state"><p>회원을 선택하면 러닝 날짜를 확인할 수 있어요</p></div>

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const actMap: Record<string, Activity[]> = {}
  activities.forEach(a => {
    const d = a.date.slice(0, 10)
    if (!actMap[d]) actMap[d] = []
    actMap[d].push(a)
  })

  const totalDist = activities.reduce((s, a) => s + a.distance_km, 0)
  const runDays = Object.keys(actMap).length

  function handlePrev() {
    if (period === '1m') {
      setPeriodOffset(o => o - 1)
    } else {
      setPeriodOffset(o => o - 1)
    }
  }
  function handleNext() {
    if (periodOffset < 0) setPeriodOffset(o => o + 1)
  }
  function handleCalendarPrev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
    if (period === '1m') setPeriodOffset(o => o - 1)
  }
  function handleCalendarNext() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
    if (period === '1m') setPeriodOffset(o => o + 1)
  }

  return (
    <div className="calendar-page">
      {/* 기간 토글 */}
      <div className="retro-period-toggle">
        {([['1w', '주'], ['1m', '월'], ['1y', '년'], ['all', '전체']] as [PeriodType, string][]).map(([key, label]) => (
          <button key={key} className={`retro-period-btn ${period === key ? 'active' : ''}`} onClick={() => { setPeriod(key); setPeriodOffset(0) }}>
            {label}
          </button>
        ))}
      </div>

      {/* 날짜 네비 */}
      <div className="retro-period-nav">
        <button className="retro-period-arrow" onClick={handlePrev}>‹</button>
        <span className="retro-period-label">{periodLabel}</span>
        <button className="retro-period-arrow" onClick={handleNext}>›</button>
      </div>

      {/* 스탯 4칸 */}
      <div className="retro-section" style={{ marginTop: 8 }}>
        <div className="retro-stats-grid">
          <div className="retro-stats-item">
            <span className="retro-stats-label">총 거리</span>
            <span className="retro-stats-val">{formatDist(periodStats.distance)}</span>
          </div>
          <div className="retro-stats-item">
            <span className="retro-stats-label">최장거리</span>
            <span className="retro-stats-val">{formatDist(periodStats.longest)}</span>
          </div>
          <div className="retro-stats-item">
            <span className="retro-stats-label">평균 페이스</span>
            <span className="retro-stats-val">{periodStats.avgPace > 0 ? formatPace(periodStats.avgPace) : '-'}</span>
          </div>
          <div className="retro-stats-item">
            <span className="retro-stats-label">러닝횟수</span>
            <span className="retro-stats-val">{periodStats.days}회</span>
          </div>
        </div>
      </div>

      {/* 월 캘린더 (항상 표시) */}
      {(
        <div className="calendar-container" style={{ marginTop: 12 }}>
          <div className="calendar-nav">
            <button onClick={handleCalendarPrev}>◀</button>
            <h3>{year}년 {month}월</h3>
            <button onClick={handleCalendarNext}>▶</button>
          </div>

          {loading ? <div className="loading-state">로딩 중...</div> : (
            <>
              <div className="calendar-grid">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                  <div key={d} className="calendar-dow">{d}</div>
                ))}
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`e${i}`} className="calendar-day empty" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayActs = actMap[dateStr] || []
                  const hasRun = dayActs.length > 0
                  const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
                  const isSelected = selectedDate === dateStr
                  return (
                    <div
                      key={day}
                      className={`calendar-day${hasRun ? ' has-run' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                      onClick={() => hasRun && setSelectedDate(isSelected ? null : dateStr)}
                    >
                      <span className="day-num">{day}</span>
                      {hasRun && (
                        <span className="run-egg">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#A51C30" stroke="none">
                            <ellipse cx="12" cy="13" rx="8" ry="10"/>
                          </svg>
                          {dayActs.length > 1 && <span className="run-count">{dayActs.length}</span>}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="monthly-summary">
                <span>{runDays}일 달림</span>
                <span>{totalDist.toFixed(1)}km</span>
              </div>

              {selectedDate && actMap[selectedDate] && (
                <div className="day-detail">
                  <h4>{selectedDate.slice(5).replace('-', '월 ')}일 기록</h4>
                  {actMap[selectedDate].map((act, i) => (
                    <div key={i} className="activity-item">
                      <div className="act-name">{act.activity_name || '러닝'}</div>
                      <div className="act-stats">
                        <span>{act.distance_km.toFixed(2)}km</span>
                        <span>{formatTime(act.moving_time_sec)}</span>
                        <span>{formatPace(act.avg_pace_sec)}/km</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
