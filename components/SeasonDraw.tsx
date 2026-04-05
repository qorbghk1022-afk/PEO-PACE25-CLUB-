'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member } from '@/lib/types'
import GachaMachine from '@/components/GachaMachine'

const QUARTER = {
  start: '2026-01-20',
  end: '2026-04-19',
}

const CHALLENGE_DATES = [
  { start: '2026-01-26', end: '2026-02-08' },
  { start: '2026-02-09', end: '2026-02-22' },
  { start: '2026-02-23', end: '2026-03-08' },
  { start: '2026-03-09', end: '2026-03-22' },
  { start: '2026-03-23', end: '2026-04-05' },
  { start: '2026-04-06', end: '2026-04-19' },
]

function getThirdSaturday(year: number, month: number) {
  const first = new Date(year, month - 1, 1)
  const firstDay = first.getDay()
  const firstSat = firstDay <= 6 ? (6 - firstDay + 1) : 1
  return firstSat + 14
}

const SESSION_DATES = [
  { month: '2월', date: `2026-02-${String(getThirdSaturday(2026, 2)).padStart(2, '0')}` },
  { month: '3월', date: `2026-03-${String(getThirdSaturday(2026, 3)).padStart(2, '0')}` },
  { month: '4월', date: `2026-04-${String(getThirdSaturday(2026, 4)).padStart(2, '0')}` },
]

const BALL_COLORS = ['#A51C30', '#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#2d5fa0', '#8e44ad', '#16a085', '#d35400', '#2c3e50', '#c0392b', '#7f8c8d', '#1abc9c', '#9b59b6', '#34495e', '#e91e63', '#00bcd4', '#ff9800', '#4caf50', '#3f51b5', '#795548', '#607d8b', '#ff5722', '#009688', '#673ab7', '#cddc39']

export default function SeasonDraw({ member, members }: { member: Member | null; members: Member[] }) {
  const [challengeClears, setChallengeClears] = useState<boolean[]>([])
  const [sessionClears, setSessionClears] = useState<(boolean | null)[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  const now = new Date()
  const quarterEnd = new Date(QUARTER.end)
  const quarterStart = new Date(QUARTER.start)
  const totalDays = Math.ceil((quarterEnd.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.min(Math.ceil((now.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)), totalDays)
  const daysLeft = Math.max(0, Math.ceil((quarterEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  const progressPct = Math.round((elapsedDays / totalDays) * 100)
  const isQuarterOver = now > quarterEnd

  useEffect(() => {
    if (!member) return
    loadTicketData()
  }, [member])

  async function loadTicketData() {
    if (!member) return
    const clears: boolean[] = []
    for (const ch of CHALLENGE_DATES) {
      if (new Date(ch.start) > now) { clears.push(false); continue }
      const { data } = await supabase.from('activities').select('distance_km')
        .eq('member_nickname', member.nickname).gte('date', ch.start).lte('date', ch.end)
      const total = (data || []).reduce((s, a) => s + a.distance_km, 0)
      clears.push(total >= 15)
    }
    setChallengeClears(clears)

    const sessions: (boolean | null)[] = []
    for (const s of SESSION_DATES) {
      if (new Date(s.date) > now) { sessions.push(null); continue }
      const { data } = await supabase.from('activities').select('distance_km')
        .eq('member_nickname', member.nickname).eq('date', s.date)
      const total = (data || []).reduce((s, a) => s + a.distance_km, 0)
      sessions.push(total >= 15)
    }
    setSessionClears(sessions)
  }

  const challengeTickets = challengeClears.filter(Boolean).length
  const sessionTickets = sessionClears.filter(v => v === true).length * 2
  const totalTickets = challengeTickets + sessionTickets
  const maxTickets = CHALLENGE_DATES.length + SESSION_DATES.length * 2

  function handleDraw() {
    if (!isQuarterOver) return
    setIsDrawing(true)
    setTimeout(() => setIsDrawing(false), 3000)
  }

  return (
    <div className="draw-wrap">
      {/* 헤더 */}
      <div className="draw-header">
        <div className="draw-header-row1">
          <div className="draw-header-title">SEASON DRAW</div>
          <div className="draw-header-dday">D-{daysLeft}</div>
        </div>
        <div className="draw-header-row2">
          <span className="draw-nav-arrow">‹</span>
          <span className="draw-nav-label">{QUARTER.start} ~ {QUARTER.end}</span>
          <span className="draw-nav-arrow">›</span>
          <span className="draw-header-pct">{progressPct}%</span>
        </div>
      </div>

      {/* 뽑기 머신 */}
      <div className="draw-machine-area">
        <GachaMachine
          ticketCount={totalTickets}
          totalBalls={totalTickets}
          disabled={!isQuarterOver}
          onDraw={handleDraw}
        />
      </div>

      {/* 내 추첨권 */}
      {member && (
        <div className="draw-my-tickets">
          <div className="draw-tickets-header">
            <span>내 추첨권</span>
            <span className="draw-tickets-count">{totalTickets}장 / 최대 {maxTickets}장</span>
          </div>

          <div className="draw-tickets-row">
            <span className="draw-tickets-label">챌린지 완주</span>
            <div className="draw-tickets-checks">
              {CHALLENGE_DATES.map((_, i) => (
                <span key={i} className={`draw-check ${challengeClears[i] ? 'checked' : ''}`}>
                  {challengeClears[i] ? '✓' : '○'}
                </span>
              ))}
            </div>
            <span className="draw-tickets-sub">{challengeTickets}/{CHALLENGE_DATES.length}장</span>
          </div>

          <div className="draw-tickets-row">
            <span className="draw-tickets-label">정기세션</span>
            <div className="draw-tickets-checks">
              {SESSION_DATES.map((_, i) => (
                <span key={i} className={`draw-check ${sessionClears[i] === true ? 'checked' : ''}`}>
                  {sessionClears[i] === true ? '✓' : sessionClears[i] === false ? '✗' : '○'}
                </span>
              ))}
            </div>
            <span className="draw-tickets-sub">{sessionTickets}/{SESSION_DATES.length * 2}장</span>
          </div>

          <div className="draw-session-detail">
            {SESSION_DATES.map((s, i) => (
              <div key={i} className="draw-session-item">
                <span>{s.month} 3째주토 15km</span>
                <span>{sessionClears[i] === true ? '✓' : sessionClears[i] === false ? '-' : '아직'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
