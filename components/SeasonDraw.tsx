'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member } from '@/lib/types'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import GachaMachine from '@/components/GachaMachine'
import { QUARTERS, formatSessionLabel, quarterStatus, type QuarterConfig } from '@/lib/quarters'

interface DrawResult { rank: number; prize: string; winner_nickname: string; ticket_count: number }

export default function SeasonDraw({ member, members: _members, crewId }: { member: Member | null; members: Member[]; crewId: string | null }) {
  void _members
  const [currentQuarterIdx, setCurrentQuarterIdx] = useState(() => {
    if (typeof window === 'undefined') return 0
    const v = Number(localStorage.getItem('peo_draw_qidx') ?? 0); return Number.isFinite(v) ? v : 0
  })
  const [challengeClears, setChallengeClears] = useState<boolean[]>([])
  const [sessionClears, setSessionClears] = useState<(boolean | null)[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawResults, setDrawResults] = useState<DrawResult[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('peo_draw_qidx', String(currentQuarterIdx)) }, [currentQuarterIdx])

  // 크루에 챌린지가 존재하는 분기만 노출 (크루 생성 이전 분기 숨김)
  const [availableQuarters, setAvailableQuarters] = useState<QuarterConfig[]>(QUARTERS)
  useEffect(() => {
    if (!crewId) { setAvailableQuarters(QUARTERS); return }
    supabase.from('challenges').select('start_date, end_date').eq('crew_id', crewId)
      .then(({ data }) => {
        const chs = data || []
        const filtered = QUARTERS.filter(q => chs.some(c => c.start_date >= q.start && c.end_date <= q.end))
        setAvailableQuarters(filtered.length > 0 ? filtered : [QUARTERS[0]])
      })
  }, [crewId])

  const safeQIdx = Math.min(Math.max(currentQuarterIdx, 0), Math.max(availableQuarters.length - 1, 0))
  const q = availableQuarters[safeQIdx] ?? QUARTERS[0]
  const status = quarterStatus(q)

  const quarterEnd = new Date(q.end)
  const daysLeft = Math.max(0, Math.ceil((quarterEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

  const loadTicketData = useCallback(async () => {
    if (!member || !crewId) return
    const now = new Date()
    const crewFilter = `crew_id.eq.${crewId},crew_id.is.null`
    // 챌린지 완주 체크 — 분기 내 2주 챌린지 각각 ≥15km (해당 크루 + Strava만)
    const todayStrForCh = now.toISOString().slice(0, 10)
    const clears: boolean[] = []
    for (const ch of q.challengeDates) {
      if (ch.start > todayStrForCh) { clears.push(false); continue }
      const { data } = await supabase.from('activities').select('distance_km')
        .eq('member_nickname', member.nickname).gte('date', ch.start).lte('date', ch.end)
        .or(crewFilter)
      const total = (data || []).reduce((s, a) => s + Number(a.distance_km), 0)
      clears.push(total >= 15)
    }
    setChallengeClears(clears)

    // 세션 참여 체크 — activities ≥15km 또는 manualSessions 인정 (crewId별)
    const manual: Record<string, string[]> = crewId ? (q.manualSessions?.[crewId] ?? {}) : {}
    const todayStr = now.toISOString().slice(0, 10)
    const sessions: (boolean | null)[] = []
    for (const sd of q.sessionDates) {
      // 미래 날짜: 문자열 비교로 엄격 판정 (timezone 이슈 방지)
      if (sd > todayStr) { sessions.push(null); continue }
      if (manual[sd]?.includes(member.nickname)) { sessions.push(true); continue }
      const { data } = await supabase.from('activities').select('distance_km')
        .eq('member_nickname', member.nickname).eq('date', sd)
        .or(crewFilter)
      const total = (data || []).reduce((s, a) => s + Number(a.distance_km), 0)
      sessions.push(total >= 15)
    }
    setSessionClears(sessions)
  }, [member, q, crewId])

  // 분기 추첨 결과 로드 (이미 있으면 오버레이로 표시)
  const loadDrawResults = useCallback(async () => {
    if (!crewId) { setDrawResults([]); setShowResults(false); return }
    const res = await fetch(`/api/draw?quarter=${encodeURIComponent(q.name)}&crew_id=${encodeURIComponent(crewId)}`)
    if (!res.ok) { setDrawResults([]); setShowResults(false); return }
    const { results } = await res.json()
    const arr = results || []
    setDrawResults(arr)
    setShowResults(arr.length > 0)
  }, [q.name, crewId])

  useEffect(() => {
    if (!member) return
    loadTicketData()
  }, [member, currentQuarterIdx, loadTicketData])

  useEffect(() => {
    loadDrawResults()
  }, [currentQuarterIdx, loadDrawResults])

  const challengeTickets = challengeClears.filter(Boolean).length
  const sessionTickets = sessionClears.filter(v => v === true).length * 2
  const totalTickets = challengeTickets + sessionTickets
  const maxTickets = q.challengeDates.length + q.sessionDates.length * 2

  const hasDrawResults = drawResults.length > 0
  // 분기 상태별 추첨 가능 여부
  const canDraw = status === 'ended' && !hasDrawResults

  async function handleDraw() {
    if (!canDraw || !crewId) return
    setIsDrawing(true)
    setTimeout(async () => {
      setIsDrawing(false)
      const res = await fetchWithAuth('/api/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter: q.name, crew_id: crewId }),
      })
      const { results } = await res.json()
      if (results) {
        setDrawResults(results)
        setShowResults(true)
      }
    }, 3000)
  }

  void isDrawing

  const statusLabel = status === 'upcoming' ? '대기' : status === 'active' ? `D-${daysLeft}` : (hasDrawResults ? '추첨 완료' : 'D-0')

  return (
    <div className="draw-wrap">
      {/* 헤더 */}
      <div className="draw-header">
        <div className="draw-header-row1">
          <div className="draw-header-title">SEASON DRAW</div>
          <div className="draw-header-dday">{statusLabel}</div>
        </div>
        <div className="draw-header-row2">
          <button
            className="draw-nav-arrow"
            onClick={() => setCurrentQuarterIdx(i => Math.min(i + 1, availableQuarters.length - 1))}
            disabled={safeQIdx >= availableQuarters.length - 1}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >‹</button>
          <span className="draw-nav-label">{q.start} ~ {q.end}</span>
          <button
            className="draw-nav-arrow"
            onClick={() => setCurrentQuarterIdx(i => Math.max(i - 1, 0))}
            disabled={safeQIdx <= 0}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >›</button>
        </div>
      </div>

      {/* 가챠 머신 — 항상 표시 (이미 추첨된 분기도 뒤에 보임) */}
      <div className="draw-machine-area">
        <GachaMachine
          ticketCount={totalTickets}
          totalBalls={totalTickets}
          disabled={!canDraw}
          onDraw={handleDraw}
        />
      </div>

      {/* 추첨 결과 오버레이 — 가챠 위에 팝업. X로 닫기. 재추첨해도 결과 불변 */}
      {showResults && drawResults.length > 0 && (
        <div className="draw-result-overlay">
          <div className="draw-result-popup">
            <button className="draw-result-close" onClick={() => setShowResults(false)}>×</button>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#A51C30', textAlign: 'center', marginBottom: 4 }}>
              {q.name} 추첨 결과
            </div>
            {drawResults.map((r, i) => (
              <div key={i} className={`draw-result-item ${r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : 'bronze'}`}>
                <span className="draw-result-medal">{r.rank === 1 ? '👑' : r.rank === 2 ? '🥈' : '🥉'}</span>
                <span className="draw-result-name">{r.winner_nickname}</span>
                <span className="draw-result-prize">{r.prize}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {q.challengeDates.map((_, i) => (
                <span key={i} className={`draw-check ${challengeClears[i] ? 'checked' : ''}`}>
                  {challengeClears[i] ? '✓' : '○'}
                </span>
              ))}
            </div>
            <span className="draw-tickets-sub">{challengeTickets}/{q.challengeDates.length}장</span>
          </div>

          <div className="draw-tickets-row">
            <span className="draw-tickets-label">정기세션</span>
            <div className="draw-tickets-checks">
              {q.sessionDates.map((_, i) => (
                <span key={i} className={`draw-check ${sessionClears[i] === true ? 'checked' : ''}`}>
                  {sessionClears[i] === true ? '✓' : sessionClears[i] === false ? '✗' : '○'}
                </span>
              ))}
            </div>
            <span className="draw-tickets-sub">{sessionTickets}/{q.sessionDates.length * 2}장</span>
          </div>

          <div className="draw-session-detail">
            {q.sessionDates.map((sd, i) => (
              <div key={i} className="draw-session-item">
                <span>{formatSessionLabel(sd)} · 15km+</span>
                <span>{sessionClears[i] === true ? '✓' : sessionClears[i] === false ? '-' : '대기'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
