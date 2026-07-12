'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import ProfilePopup from '@/components/ProfilePopup'
import { QUARTERS } from '@/lib/quarters'

interface TeamMember {
  nickname: string
  lv: number
  dist: number
  remain: number
  fine: number
  ticket: boolean
  reason: string | null
}

// 휴식 멤버는 DB members.leave_start/leave_end로 판단
function isOnLeave(member: Member | undefined, challengeStart: string, challengeEnd: string): string | null {
  if (!member || !member.leave_start || !member.leave_end) return null
  if (member.leave_start <= challengeEnd && member.leave_end >= challengeStart) return member.leave_reason || '휴식'
  return null
}

interface Team {
  team_num: number
  members: TeamMember[]
  totalDist: number
  goalKm: number
  shortfall: number
  fine: number
}

interface ChallengeData {
  id: string
  start_date: string
  end_date: string
  goal_km: number
  fine_per_km: number
}

export default function ChallengeBoard({
  members, seasonStats, rollingScores, crewId
}: {
  members: Member[]
  seasonStats: SeasonStats[]
  rollingScores: Record<string, RollingScores>
  crewId: string | null
}) {
  const [challenges, setChallenges] = useState<ChallengeData[]>([])
  const [currentIdx, setCurrentIdx] = useState(() => {
    if (typeof window === 'undefined') return 0
    const v = Number(localStorage.getItem('peo_cb_idx') ?? 0); return Number.isFinite(v) ? v : 0
  })
  const [currentQuarterIdx, setCurrentQuarterIdx] = useState(() => {
    if (typeof window === 'undefined') return 0
    const v = Number(localStorage.getItem('peo_cb_qidx') ?? 0); return Number.isFinite(v) ? v : 0
  })
  const [teams, setTeams] = useState<Team[]>([])
  const [period, setPeriod] = useState({ start: '', end: '', goal: 15, fine: 3000 })
  const [loading, setLoading] = useState(true)
  const [leaderNickname, setLeaderNickname] = useState<string | null>(null)
  const [totalFine, setTotalFine] = useState(0)
  const [viewMode, setViewMode] = useState<'2week' | 'quarter' | 'all'>(() => {
    if (typeof window === 'undefined') return '2week'
    const v = localStorage.getItem('peo_cb_view')
    return (v === 'quarter' || v === 'all' || v === '2week') ? v : '2week'
  })

  // state 변경 시 localStorage 동기화
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('peo_cb_idx', String(currentIdx)) }, [currentIdx])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('peo_cb_qidx', String(currentQuarterIdx)) }, [currentQuarterIdx])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('peo_cb_view', viewMode) }, [viewMode])
  const [quarterStats, setQuarterStats] = useState<{ nickname: string; dist: number; fine: number; clears: number; sessions: boolean[]; totalTickets: number }[]>([])
  const [allTimeStats, setAllTimeStats] = useState<{ nickname: string; lv: number; dist: number; score: number }[]>([])
  const [selectedProfile, setSelectedProfile] = useState<Member | null>(null)

  // 크루장 닉네임 로드
  useEffect(() => {
    supabase.from('crew_members').select('member_nickname').eq('role', 'leader').maybeSingle()
      .then(({ data }) => { if (data) setLeaderNickname(data.member_nickname) })
  }, [])

  // 전체 챌린지 목록 로드
  useEffect(() => {
    if (!crewId) return
    supabase
      .from('challenges')
      .select('*')
      .eq('crew_id', crewId)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setChallenges(data)
          setCurrentIdx(0)
          loadQuarterStats(data, currentQuarterIdx)
        }
        setLoading(false)
      })
  }, [crewId])

  // 분기 변경 시 재계산
  useEffect(() => {
    if (challenges.length > 0) loadQuarterStats(challenges, currentQuarterIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuarterIdx])

  async function loadQuarterStats(allChallenges: ChallengeData[], quarterIdx: number = currentQuarterIdx) {
    if (!crewId) return
    const memberMap: Record<string, Member> = {}
    members.forEach(m => { memberMap[m.nickname] = m })

    // 크루에 챌린지가 존재하는 분기만 대상 (크루 생성 이전 분기 제외)
    const available = allChallenges.length > 0
      ? QUARTERS.filter(q => allChallenges.some(c => c.start_date >= q.start && c.end_date <= q.end))
      : QUARTERS
    if (available.length === 0) return
    const safeIdx = Math.min(Math.max(quarterIdx, 0), available.length - 1)
    const q = available[safeIdx]
    const qStart = q.start
    const qEnd = q.end
    const qChallenges = allChallenges.filter(c => c.start_date >= qStart && c.end_date <= qEnd)

    // 분기 내 전체 활동 — 해당 크루 + Strava(NULL) 만 카운트
    const crewFilter = `crew_id.eq.${crewId},crew_id.is.null`
    const { data: acts } = await supabase
      .from('activities')
      .select('member_nickname, distance_km, date')
      .gte('date', qStart)
      .lte('date', qEnd)
      .or(crewFilter)

    const distMap: Record<string, number> = {}
    ;(acts || []).forEach(a => {
      distMap[a.member_nickname] = (distMap[a.member_nickname] || 0) + Number(a.distance_km)
    })

    // 개인 완주 체크 — QUARTERS.challengeDates 기반 (팀 배정과 무관)
    // SeasonDraw 탭과 일관된 계산. 각 분기 6개 2주 기간별 합 ≥ 15km이면 +1장
    const GOAL_KM = 15
    const clearMap: Record<string, number> = {}
    for (const nick of members.map(m => m.nickname)) clearMap[nick] = 0
    for (const cp of q.challengeDates) {
      for (const nick of members.map(m => m.nickname)) {
        const total = (acts || []).filter(a => a.member_nickname === nick && a.date >= cp.start && a.date <= cp.end)
          .reduce((s, a) => s + Number(a.distance_km), 0)
        if (total >= GOAL_KM) clearMap[nick]++
      }
    }

    // 팀 벌금 계산 — DB의 challenge_teams 있는 챌린지만 (teams 배정 안 된 Q2 초기엔 0)
    const fineMap: Record<string, number> = {}
    for (const ch of qChallenges) {
      const { data: teams } = await supabase.from('challenge_teams').select('team_num, member_nickname').eq('challenge_id', ch.id)
      if (!teams || teams.length === 0) continue
      const chDist: Record<string, number> = {}
      ;(acts || []).forEach(a => {
        if (a.date >= ch.start_date && a.date <= ch.end_date) {
          chDist[a.member_nickname] = (chDist[a.member_nickname] || 0) + Number(a.distance_km)
        }
      })
      const teamNums = [...new Set(teams.map(t => t.team_num))]
      for (const tn of teamNums) {
        const tmems = teams.filter(t => t.team_num === tn).map(t => t.member_nickname)
          .filter(n => !isOnLeave(memberMap[n], ch.start_date, ch.end_date))
        if (tmems.length === 0) continue
        const teamGoal = tmems.length * Number(ch.goal_km)
        const teamDist = tmems.reduce((s, n) => s + (chDist[n] || 0), 0)
        const shortfall = Math.max(0, teamGoal - teamDist)
        const perFine = Math.round((shortfall / tmems.length) * Number(ch.fine_per_km))
        tmems.forEach(n => { fineMap[n] = (fineMap[n] || 0) + perFine })
      }
    }


    // 정기세션 체크 — 분기별 정기세션 (매월 2째 토)
    // manualSessions는 crewId 별로 매핑 { crewId: { date: [nicknames] } }
    const sessionDates = q.sessionDates
    const manualSessions: Record<string, string[]> = crewId ? (q.manualSessions?.[crewId] ?? {}) : {}
    const todayStr = new Date().toISOString().slice(0, 10)
    const sessionMap: Record<string, boolean[]> = {}
    for (const nick of members.map(m => m.nickname)) {
      const sessions: boolean[] = []
      for (const sd of sessionDates) {
        if (sd > todayStr) { sessions.push(false); continue }
        if (manualSessions[sd]?.includes(nick)) { sessions.push(true); continue }
        const dayActs = (acts || []).filter(a => a.member_nickname === nick && a.date === sd)
        const dayTotal = dayActs.reduce((s, a) => s + Number(a.distance_km), 0)
        sessions.push(dayTotal >= 15)
      }
      sessionMap[nick] = sessions
    }

    const stats = members.map(m => {
      const sessions = sessionMap[m.nickname] || [false, false, false]
      const sessionTickets = sessions.filter(Boolean).length * 2
      return {
        nickname: m.nickname,
        dist: Math.round((distMap[m.nickname] || 0) * 10) / 10,
        fine: fineMap[m.nickname] || 0,
        clears: clearMap[m.nickname] || 0,
        sessions,
        totalTickets: (clearMap[m.nickname] || 0) + sessionTickets,
      }
    }).sort((a, b) => b.dist - a.dist)

    setQuarterStats(stats)

    // 전체 데이터 — 해당 크루만
    const { data: allActs } = await supabase.from('activities').select('member_nickname, distance_km').or(crewFilter)
    const allDist: Record<string, number> = {}
    ;(allActs || []).forEach(a => { allDist[a.member_nickname] = (allDist[a.member_nickname] || 0) + Number(a.distance_km) })

    // 최근 시즌 스탯에서 점수 가져오기
    const { data: latestStats } = await supabase.from('member_season_stats').select('member_nickname, total_score').order('total_score', { ascending: false })
    const scoreMap: Record<string, number> = {}
    ;(latestStats || []).forEach(s => { if (!scoreMap[s.member_nickname]) scoreMap[s.member_nickname] = s.total_score })

    const all = members.map(m => ({
      nickname: m.nickname,
      lv: m.lv,
      dist: Math.round((allDist[m.nickname] || 0) * 10) / 10,
      score: scoreMap[m.nickname] || 0,
    })).sort((a, b) => b.score - a.score)

    setAllTimeStats(all)
  }

  // 선택된 챌린지 데이터 로드
  useEffect(() => {
    if (challenges.length === 0) return
    loadChallengeData(challenges[currentIdx])
  }, [currentIdx, challenges, members])

  async function loadChallengeData(challenge: ChallengeData) {
    setPeriod({ start: challenge.start_date, end: challenge.end_date, goal: challenge.goal_km, fine: challenge.fine_per_km })

    const { data: teamsData } = await supabase
      .from('challenge_teams')
      .select('team_num, member_nickname')
      .eq('challenge_id', challenge.id)

    const crewFilter = crewId ? `crew_id.eq.${crewId},crew_id.is.null` : ''
    let actsQuery = supabase
      .from('activities')
      .select('member_nickname, distance_km')
      .gte('date', challenge.start_date)
      .lte('date', challenge.end_date)
    if (crewFilter) actsQuery = actsQuery.or(crewFilter)
    const { data: activities } = await actsQuery

    const distMap: Record<string, number> = {}
    ;(activities || []).forEach((a: { member_nickname: string; distance_km: number }) => {
      distMap[a.member_nickname] = (distMap[a.member_nickname] || 0) + Number(a.distance_km)
    })

    const memberMap: Record<string, Member> = {}
    members.forEach(m => { memberMap[m.nickname] = m })

    const teamNums = [...new Set((teamsData || []).map((t: { team_num: number }) => t.team_num))].sort((a, b) => a - b)
    const teamList: Team[] = teamNums.map(num => {
      const teamMembers = (teamsData || [])
        .filter((t: { team_num: number }) => t.team_num === num)
        .map((t: { member_nickname: string }) => t.member_nickname)
        .filter(nickname => {
          // 챌린지 종료일 이후에 처음 생성된 member row는 제외
          // 주의: new Date('YYYY-MM-DD')는 UTC 00:00으로 파싱되므로
          // 같은 날짜에 생성된 row가 탈락하는 버그를 피하려면 문자열 비교 사용
          const m = memberMap[nickname]
          if (!m) return false
          const joinDay = (m.created_at ?? '1970-01-01').slice(0, 10)
          return joinDay <= challenge.end_date
        })

      // 휴식 멤버 분리
      const activeMembers = teamMembers.filter(n => !isOnLeave(memberMap[n], challenge.start_date, challenge.end_date))
      const restMembers = teamMembers.filter(n => !!isOnLeave(memberMap[n], challenge.start_date, challenge.end_date))

      const goalKm = activeMembers.length * Number(challenge.goal_km)
      const totalDist = activeMembers.reduce((s: number, n: string) => s + (distMap[n] || 0), 0)
      const teamShortfall = Math.max(0, goalKm - totalDist)
      const activeCnt = activeMembers.length || 1
      const perMemberRemain = teamShortfall / activeCnt
      const perMemberFine = Math.round(perMemberRemain * Number(challenge.fine_per_km))

      const mems = activeMembers.map(nickname => {
        const dist = distMap[nickname] || 0
        return {
          nickname, lv: memberMap[nickname]?.lv || 0, dist,
          remain: teamShortfall > 0 ? perMemberRemain : 0,
          fine: teamShortfall > 0 ? perMemberFine : 0,
          ticket: dist >= Number(challenge.goal_km), reason: null as string | null,
        }
      })

      return { team_num: num, members: mems, totalDist, goalKm, shortfall: teamShortfall, fine: Math.round(teamShortfall * Number(challenge.fine_per_km)) }
    })

    // 휴식 멤버를 별도 팀(-) 으로 추가
    const allRest: TeamMember[] = []
    for (const mb of members) {
      const reason = isOnLeave(mb, challenge.start_date, challenge.end_date)
      if (reason) {
        allRest.push({
          nickname: mb.nickname, lv: mb.lv || 0, dist: 0,
          remain: 0, fine: 0, ticket: false, reason,
        })
      }
    }
    if (allRest.length > 0) {
      teamList.push({ team_num: -1, members: allRest, totalDist: 0, goalKm: 0, shortfall: 0, fine: 0 })
    }

    setTeams(teamList)
    setTotalFine(teamList.filter(t => t.team_num > 0).reduce((s, t) => s + t.fine, 0))
  }

  if (loading) return <div className="loading-state">로딩 중...</div>

  if (challenges.length === 0) {
    return (
      <div className="empty-state">
        <p>진행 중인 챌린지가 없습니다.</p>
      </div>
    )
  }

  const activeTeams = teams.filter(t => t.team_num > 0)
  const restTeam = teams.find(t => t.team_num === -1)
  const activeMembers = activeTeams.flatMap(t => t.members)
  const completedMembers = activeMembers.filter(m => m.ticket)
  const totalPct = activeMembers.length > 0
    ? Math.round((completedMembers.length / activeMembers.length) * 100)
    : 0

  // 크루에 실제 챌린지가 존재하는 분기만 노출 (크루 생성 이전 분기 숨김)
  const availableQuarters = challenges.length > 0
    ? QUARTERS.filter(q => challenges.some(c => c.start_date >= q.start && c.end_date <= q.end))
    : QUARTERS
  const safeQIdx = Math.min(Math.max(currentQuarterIdx, 0), Math.max(availableQuarters.length - 1, 0))
  const currentQuarter = availableQuarters[safeQIdx] ?? QUARTERS[0]
  const quarterStart = currentQuarter.start
  const quarterEnd = currentQuarter.end
  const daysLeft = Math.max(0, Math.ceil((new Date(quarterEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

  const quarterTotalFine = quarterStats.reduce((s, m) => s + m.fine, 0)
  const qChallengeCount = challenges.filter(c => c.start_date >= quarterStart && c.end_date <= quarterEnd && new Date(c.start_date) <= new Date()).length

  return (
    <div className="cb-wrap">
      <div className="cb-mode-toggle">
        <button className={`cb-mode-btn ${viewMode === '2week' ? 'active' : ''}`} onClick={() => setViewMode('2week')}>2주</button>
        <button className={`cb-mode-btn ${viewMode === 'quarter' ? 'active' : ''}`} onClick={() => setViewMode('quarter')}>3개월</button>
        <button className={`cb-mode-btn ${viewMode === 'all' ? 'active' : ''}`} onClick={() => setViewMode('all')}>전체</button>
      </div>

      {viewMode === 'all' ? (
        <>
          <div className="cb-header">
            <div className="cb-header-row1" style={{ justifyContent: 'center' }}>
              <div className="cb-title">All-Time Ranking</div>
            </div>
          </div>
          <div className="cb-table-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>RNK</th>
                  <th>LV</th>
                  <th>RUNNER</th>
                  <th>SCORE</th>
                  <th>DIST<br/>(km)</th>
                </tr>
              </thead>
              <tbody>
                {allTimeStats.map((m, i) => (
                  <tr key={m.nickname} className={i < 3 ? `rank-top${i + 1}` : ''}>
                    <td className="rank-pos">{i + 1}</td>
                    <td>{m.lv}</td>
                    <td className="rank-runner cb-clickable" onClick={() => { const mem = members.find(x => x.nickname === m.nickname); if (mem) setSelectedProfile(mem) }}>{m.nickname === leaderNickname ? <span className="leader-name">{'>'} {m.nickname} {'<'}</span> : m.nickname}</td>
                    <td className="rank-score">{m.score.toFixed(1)}</td>
                    <td>{m.dist.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : viewMode === 'quarter' ? (
        <>
          <div className="cb-header">
            <div className="cb-header-row1">
              <div className="cb-title">3-Month Run Challenge</div>
              <div className="cb-goal-km">D-{daysLeft}</div>
            </div>
            <div className="cb-header-row2">
              <div className="cb-nav">
                <button className="cb-nav-arrow"
                  onClick={() => setCurrentQuarterIdx(i => Math.min(i + 1, availableQuarters.length - 1))}
                  disabled={safeQIdx >= availableQuarters.length - 1}>‹</button>
                <span className="cb-nav-label">{quarterStart} ~ {quarterEnd}</span>
                <button className="cb-nav-arrow"
                  onClick={() => setCurrentQuarterIdx(i => Math.max(i - 1, 0))}
                  disabled={safeQIdx <= 0}>›</button>
              </div>
            </div>
          </div>
          <div className="cb-table-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>LV</th>
                  <th>RNK</th>
                  <th>RUNNER</th>
                  <th>DIST<br/>(km)</th>
                  <th>Penalty</th>
                  <th>SESSION</th>
                  <th>TICKET</th>
                </tr>
              </thead>
              <tbody>
                {quarterStats.map((m, i) => {
                  const mem = members.find(x => x.nickname === m.nickname)
                  return (
                    <tr key={m.nickname}>
                      <td>{mem?.lv || 0}</td>
                      <td className="rank-pos">{i + 1}</td>
                      <td className="rank-runner cb-clickable" onClick={() => { const mem = members.find(x => x.nickname === m.nickname); if (mem) setSelectedProfile(mem) }}>{m.nickname === leaderNickname ? <span className="leader-name">{'>'} {m.nickname} {'<'}</span> : m.nickname}</td>
                      <td>{m.dist.toFixed(1)}</td>
                      <td>{m.fine > 0 ? `₩${m.fine.toLocaleString()}` : '-'}</td>
                      <td className="cb-session">
                        <div className="session-dots">
                          {m.sessions.map((s, si) => (
                            <span key={si} className={`session-dot ${s ? 'active' : ''}`} />
                          ))}
                        </div>
                      </td>
                      <td className="cb-ticket">
                        {m.totalTickets > 0 ? (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A51C30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><path d="M9 7v10"/></svg>
                            x{m.totalTickets}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cb-total">
            <div className="cb-total-label">의지박약 외주비 합계</div>
            <div className="cb-total-value">₩{quarterTotalFine.toLocaleString()}</div>
          </div>
        </>
      ) : (
      <>
      <div className="cb-header">
        <div className="cb-header-row1">
          <div className="cb-title">2-Week Run Challenge</div>
          <div className="cb-goal-km">{period.goal}KM</div>
        </div>
        <div className="cb-header-row2">
          <div className="cb-nav">
            <button className="cb-nav-arrow" onClick={() => setCurrentIdx(i => Math.min(i + 1, challenges.length - 1))} disabled={currentIdx >= challenges.length - 1}>‹</button>
            <span className="cb-nav-label">{period.start} ~ {period.end}</span>
            <button className="cb-nav-arrow" onClick={() => setCurrentIdx(i => Math.max(i - 1, 0))} disabled={currentIdx <= 0}>›</button>
          </div>
          <div className="cb-goal-pct">{totalPct}%</div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="cb-table-wrap">
        <table className="cb-table">
          <thead>
            <tr>
              <th>LV</th>
              <th>TEAM</th>
              <th>RUNNER</th>
              <th>DIST<br/>(km)</th>
              <th>REM<br/>(km)</th>
              <th>Penalty</th>
              <th>TICKET</th>
            </tr>
          </thead>
          <tbody>
            {[...activeTeams, ...(restTeam ? [restTeam] : [])].map(team => (
              team.members.map((m, mi) => (
                <tr key={`${team.team_num}-${m.nickname}`} className={team.team_num === -1 ? 'cb-rest-row' : ''}>
                  <td>{m.lv}</td>
                  {mi === 0 && <td rowSpan={team.members.length} className="cb-team-cell">{team.team_num === -1 ? '-' : team.team_num}</td>}
                  <td className="rank-runner cb-clickable" onClick={() => { const mem = members.find(x => x.nickname === m.nickname); if (mem) setSelectedProfile(mem) }}>{m.nickname === leaderNickname ? <span className="leader-name">{'>'} {m.nickname} {'<'}</span> : m.nickname}</td>
                  <td>{m.dist.toFixed(1)}</td>
                  <td>{m.remain.toFixed(1)}</td>
                  <td>{m.fine > 0 ? `₩${m.fine.toLocaleString()}` : '0'}</td>
                  <td className="cb-ticket">{m.reason ? <span className="cb-reason">{m.reason}</span> : m.ticket ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A51C30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><path d="M9 7v10"/></svg> : '-'}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      {/* 벌금 합계 */}
      <div className="cb-total">
        <div className="cb-total-label">의지박약 외주비 합계</div>
        <div className="cb-total-value">₩{totalFine.toLocaleString()}</div>
      </div>
      </>
      )}

      {/* 프로필 팝업 */}
      {selectedProfile && (
        <ProfilePopup
          member={selectedProfile}
          stats={seasonStats.find(s => s.member_nickname === selectedProfile.nickname)}
          rolling={rollingScores[selectedProfile.nickname]}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  )
}
