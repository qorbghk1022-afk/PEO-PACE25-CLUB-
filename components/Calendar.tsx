'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member } from '@/lib/types'
import { formatPace, formatTime } from '@/lib/scoring'

const EGG_EMOJI: Record<string, string> = { star: '⭐', cloud: '☁️', moon: '🌙', heart: '❤️', sun: '☀️' }

interface Activity {
  date: string
  distance_km: number
  avg_pace_sec: number
  moving_time_sec: number
  activity_name: string | null
}

export default function Calendar({
  member, members, onSelectMember
}: {
  member: Member | null
  members: Member[]
  onSelectMember: (m: Member) => void
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (member) loadActivities() }, [member, year, month])

  async function loadActivities() {
    if (!member) return
    setLoading(true)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = new Date(year, month, 0).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('activities')
      .select('date, distance_km, avg_pace_sec, moving_time_sec, activity_name')
      .eq('member_nickname', member.nickname)
      .gte('date', start)
      .lte('date', end)
      .order('date')
    setActivities((data as Activity[]) || [])
    setLoading(false)
  }

  if (!member) return <div className="empty-state"><p>🔥 회원을 선택하면 러닝 날짜를 확인할 수 있어요</p></div>

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const actMap: Record<string, Activity[]> = {}
  activities.forEach(a => {
    const d = a.date.slice(0, 10)
    if (!actMap[d]) actMap[d] = []
    actMap[d].push(a)
  })

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const totalDist = activities.reduce((s, a) => s + a.distance_km, 0)
  const runDays = Object.keys(actMap).length

  return (
    <div className="calendar-page">
      <div className="member-selector">
        {members.map(m => (
          <button key={m.nickname} className={`member-chip ${m.nickname === member.nickname ? 'active' : ''}`} onClick={() => onSelectMember(m)}>
            {EGG_EMOJI[m.egg_type] || '🥚'} {m.nickname}
          </button>
        ))}
      </div>

      <div className="calendar-container">
        <div className="calendar-nav">
          <button onClick={prevMonth}>◀</button>
          <h3>{year}년 {month}월 — {member.nickname}</h3>
          <button onClick={nextMonth}>▶</button>
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
                    {hasRun && <span className="fire-icon">🔥{dayActs.length > 1 ? dayActs.length : ''}</span>}
                  </div>
                )
              })}
            </div>

            <div className="monthly-summary">
              <span>🔥 {runDays}일 달림</span>
              <span>📏 {totalDist.toFixed(1)}km</span>
            </div>

            {selectedDate && actMap[selectedDate] && (
              <div className="day-detail">
                <h4>{selectedDate.slice(5).replace('-', '월 ')}일 기록</h4>
                {actMap[selectedDate].map((act, i) => (
                  <div key={i} className="activity-item">
                    <div className="act-name">{act.activity_name || '러닝'}</div>
                    <div className="act-stats">
                      <span>📏 {act.distance_km.toFixed(2)}km</span>
                      <span>⏱️ {formatTime(act.moving_time_sec)}</span>
                      <span>🏃 {formatPace(act.avg_pace_sec)}/km</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
