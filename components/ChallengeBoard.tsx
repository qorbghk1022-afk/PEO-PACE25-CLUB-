'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats } from '@/lib/types'

interface TeamMember {
  nickname: string
  lv: number
  dist: number
  remain: number
  fine: number
}

interface Team {
  team_num: number
  members: TeamMember[]
  totalDist: number
  goalKm: number
  shortfall: number
  fine: number
}

export default function ChallengeBoard({
  members, seasonStats
}: {
  members: Member[]
  seasonStats: SeasonStats[]
}) {
  const [teams, setTeams] = useState<Team[]>([])
  const [period, setPeriod] = useState({ start: '', end: '', goal: 15, fine: 3000 })
  const [loading, setLoading] = useState(true)
  const [totalFine, setTotalFine] = useState(0)

  useEffect(() => { loadChallenge() }, [])

  async function loadChallenge() {
    const { data: challenge } = await supabase
      .from('challenges')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(1)
      .single()

    if (!challenge) { setLoading(false); return }

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
      const mems = (teamsData || [])
        .filter((t: { team_num: number }) => t.team_num === num)
        .map((t: { member_nickname: string }) => {
          const dist = distMap[t.member_nickname] || 0
          const remain = Math.max(0, challenge.goal_km - dist)
          const fine = Math.round(remain * challenge.fine_per_km)
          return {
            nickname: t.member_nickname,
            lv: memberMap[t.member_nickname]?.lv || 0,
            dist,
            remain,
            fine,
          }
        })
      const goalKm = mems.length * challenge.goal_km
      const totalDist = mems.reduce((s, m) => s + m.dist, 0)
      const shortfall = Math.max(0, goalKm - totalDist)
      return { team_num: num, members: mems, totalDist, goalKm, shortfall, fine: Math.round(shortfall * challenge.fine_per_km) }
    })

    setTeams(teamList)
    setTotalFine(teamList.reduce((s, t) => s + t.fine, 0))
    setLoading(false)
  }

  if (loading) return <div className="loading-state">로딩 중...</div>

  if (!period.start) {
    return (
      <div className="empty-state">
        <p>⚡ 진행 중인 챌린지가 없습니다.</p>
        <p className="empty-sub">Supabase challenges 테이블에 챌린지를 등록해주세요.</p>
      </div>
    )
  }

  const allMembers = teams.flatMap(t => t.members.map(m => ({ ...m, team_num: t.team_num })))
  const totalPct = teams.length > 0
    ? Math.min(Math.round((teams.reduce((s, t) => s + t.totalDist, 0) / teams.reduce((s, t) => s + t.goalKm, 0)) * 100), 100)
    : 0

  return (
    <div className="cb-wrap">
      {/* 헤더 */}
      <div className="cb-header">
        <div className="cb-header-left">
          <div className="cb-header-title">2-Week Run Challenge</div>
          <div className="cb-header-period">{period.start}~{period.end}</div>
        </div>
        <div className="cb-header-right">
          <div className="cb-goal-km">{period.goal}KM</div>
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
              <th>RESULT</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(team => (
              team.members.map((m, mi) => (
                <tr key={`${team.team_num}-${m.nickname}`}>
                  <td>{m.lv}</td>
                  {mi === 0 && <td rowSpan={team.members.length} className="cb-team-cell">{team.team_num}</td>}
                  <td>{m.nickname}</td>
                  <td>{m.dist.toFixed(1)}</td>
                  <td>{m.remain.toFixed(1)}</td>
                  <td>₩{m.fine.toLocaleString()}</td>
                  <td className="cb-result">{m.remain <= 0 ? 'Clear!' : "Let's roll!"}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      {/* 벌금 합계 */}
      <div className="cb-total">
        <div className="cb-total-label">스프린트 벌금 합계</div>
        <div className="cb-total-value">₩{totalFine.toLocaleString()}</div>
      </div>
    </div>
  )
}
