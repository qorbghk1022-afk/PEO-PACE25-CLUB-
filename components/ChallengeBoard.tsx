'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import ProfilePopup from '@/components/ProfilePopup'

interface TeamMember {
  nickname: string
  lv: number
  dist: number
  remain: number
  fine: number
  ticket: boolean
  reason: string | null
}

// 휴식/병가/출산휴가 등 사유가 있는 멤버 (챌린지 기간별)
const REST_MEMBERS: Record<string, Record<string, string>> = {
  '갤러리킴': { '2026-03-09': '병가', '2026-03-23': '병가' },
  '꾸마': { '2026-03-09': '출산휴가', '2026-03-23': '출산휴가' },
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
  const [currentIdx, setCurrentIdx] = useState(0)
  const [teams, setTeams] = useState<Team[]>([])
  const [period, setPeriod] = useState({ start: '', end: '', goal: 15, fine: 3000 })
  const [loading, setLoading] = useState(true)
  const [leaderNickname, setLeaderNickname] = useState<string | null>(null)
  const [totalFine, setTotalFine] = useState(0)
  const [viewMode, setViewMode] = useState<'2week' | 'quarter' | 'all'>('2week')
  const [quarterStats, setQuarterStats] = useState<{ nickname: string; dist: number; fine: number; clears: number }[]>([])
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
    let query = supabase
      .from('challenges')
      .select('*')
      .eq('crew_id', crewId)
      .order('start_date', { ascending: false })
    query
      .then(({ data }) => {
        if (data && data.length > 0) {
          setChallenges(data)
          setCurrentIdx(0)
          loadQuarterStats(data)
        }
        setLoading(false)
      })
  }, [crewId])

  async function loadQuarterStats(allChallenges: ChallengeData[]) {
    const qStart = '2026-01-20'
    const qEnd = '2026-04-19'
    const qChallenges = allChallenges.filter(c => c.start_date >= qStart && c.end_date <= qEnd)

    // 분기 내 전체 활동
    const { data: acts } = await supabase
      .from('activities')
      .select('member_nickname, distance_km, date')
      .gte('date', qStart)
      .lte('date', qEnd)

    const distMap: Record<string, number> = {}
    ;(acts || []).forEach(a => {
      distMap[a.member_nickname] = (distMap[a.member_nickname] || 0) + a.distance_km
    })

    // 각 챌린지별 팀 벌금 계산
    const fineMap: Record<string, number> = {}
    const clearMap: Record<string, number> = {}
    for (const ch of qChallenges) {
      const { data: teams } = await supabase.from('challenge_teams').select('team_num, member_nickname').eq('challenge_id', ch.id)
      const { data: chActs } = await supabase.from('activities').select('member_nickname, distance_km').gte('date', ch.start_date).lte('date', ch.end_date)

      const chDist: Record<string, number> = {}
      ;(chActs || []).forEach(a => { chDist[a.member_nickname] = (chDist[a.member_nickname] || 0) + a.distance_km })

      // 개인 완주 체크
      ;(teams || []).forEach(t => {
        if (!clearMap[t.member_nickname]) clearMap[t.member_nickname] = 0
        if ((chDist[t.member_nickname] || 0) >= ch.goal_km) clearMap[t.member_nickname]++
      })

      // 팀별 벌금
      const teamNums = [...new Set((teams || []).map(t => t.team_num))]
      for (const tn of teamNums) {
        const tmems = (teams || []).filter(t => t.team_num === tn).map(t => t.member_nickname)
          .filter(n => !REST_MEMBERS[n]?.[ch.start_date])
        if (tmems.length === 0) continue
        const teamGoal = tmems.length * ch.goal_km
        const teamDist = tmems.reduce((s, n) => s + (chDist[n] || 0), 0)
        const shortfall = Math.max(0, teamGoal - teamDist)
        const perFine = Math.round((shortfall / tmems.length) * ch.fine_per_km)
        tmems.forEach(n => { fineMap[n] = (fineMap[n] || 0) + perFine })
      }
    }

    const stats = members.map(m => ({
      nickname: m.nickname,
      dist: Math.round((distMap[m.nickname] || 0) * 10) / 10,
      fine: fineMap[m.nickname] || 0,
      clears: clearMap[m.nickname] || 0,
    })).sort((a, b) => b.dist - a.dist)

    setQuarterStats(stats)

    // 전체 데이터
    const { data: allActs } = await supabase.from('activities').select('member_nickname, distance_km')
    const allDist: Record<string, number> = {}
    ;(allActs || []).forEach(a => { allDist[a.member_nickname] = (allDist[a.member_nickname] || 0) + a.distance_km })

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

    const { data: activities } = await supabase
      .from('activities')
      .select('member_nickname, distance_km')
      .gte('date', challenge.start_date)
      .lte('date', challenge.end_date)

    const distMap: Record<string, number> = {}
    ;(activities || []).forEach((a: { member_nickname: string; distance_km: number }) => {
      distMap[a.member_nickname] = (distMap[a.member_nickname] || 0) + a.distance_km
    })

    const memberMap: Record<string, Member> = {}
    members.forEach(m => { memberMap[m.nickname] = m })

    const teamNums = [...new Set((teamsData || []).map((t: { team_num: number }) => t.team_num))].sort((a, b) => a - b)
    const teamList: Team[] = teamNums.map(num => {
      const teamMembers = (teamsData || [])
        .filter((t: { team_num: number }) => t.team_num === num)
        .map((t: { member_nickname: string }) => t.member_nickname)
        .filter(nickname => {
          // 가입일이 챌린지 시작일 이후면 제외
          const m = memberMap[nickname]
          if (!m) return false
          const joinDate = m.created_at ? new Date(m.created_at) : new Date(0)
          return joinDate <= new Date(challenge.end_date)
        })

      // 휴식 멤버 분리
      const activeMembers = teamMembers.filter(n => !REST_MEMBERS[n]?.[challenge.start_date])
      const restMembers = teamMembers.filter(n => !!REST_MEMBERS[n]?.[challenge.start_date])

      const goalKm = activeMembers.length * challenge.goal_km
      const totalDist = activeMembers.reduce((s: number, n: string) => s + (distMap[n] || 0), 0)
      const teamShortfall = Math.max(0, goalKm - totalDist)
      const activeCnt = activeMembers.length || 1
      const perMemberRemain = teamShortfall / activeCnt
      const perMemberFine = Math.round(perMemberRemain * challenge.fine_per_km)

      const mems = activeMembers.map(nickname => {
        const dist = distMap[nickname] || 0
        return {
          nickname, lv: memberMap[nickname]?.lv || 0, dist,
          remain: teamShortfall > 0 ? perMemberRemain : 0,
          fine: teamShortfall > 0 ? perMemberFine : 0,
          ticket: dist >= challenge.goal_km, reason: null as string | null,
        }
      })

      return { team_num: num, members: mems, totalDist, goalKm, shortfall: teamShortfall, fine: Math.round(teamShortfall * challenge.fine_per_km) }
    })

    // 휴식 멤버를 별도 팀(-) 으로 추가
    const allRest: TeamMember[] = []
    for (const nickname of Object.keys(REST_MEMBERS)) {
      if (REST_MEMBERS[nickname]?.[challenge.start_date]) {
        allRest.push({
          nickname, lv: memberMap[nickname]?.lv || 0, dist: 0,
          remain: 0, fine: 0, ticket: false,
          reason: REST_MEMBERS[nickname][challenge.start_date],
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

  // 분기 계산
  const quarterStart = '2026-01-20'
  const quarterEnd = '2026-04-19'
  const daysLeft = Math.max(0, Math.ceil((new Date(quarterEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const totalQDays = Math.ceil((new Date(quarterEnd).getTime() - new Date(quarterStart).getTime()) / (1000 * 60 * 60 * 24))
  const elapsedQDays = Math.min(Math.ceil((Date.now() - new Date(quarterStart).getTime()) / (1000 * 60 * 60 * 24)), totalQDays)
  const progressPct = Math.round((elapsedQDays / totalQDays) * 100)

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
                <button className="cb-nav-arrow" onClick={() => {}} disabled>‹</button>
                <span className="cb-nav-label">{quarterStart} ~ {quarterEnd}</span>
                <button className="cb-nav-arrow" onClick={() => {}} disabled>›</button>
              </div>
              <div className="cb-goal-pct">{progressPct}%</div>
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
                      <td>{m.fine > 0 ? m.fine.toLocaleString() : '-'}</td>
                      <td className="cb-ticket">
                        {m.clears > 0 ? (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A51C30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><path d="M9 7v10"/></svg>
                            x{m.clears}
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
                  <td>{m.fine.toLocaleString()}</td>
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
