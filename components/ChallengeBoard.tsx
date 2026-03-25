'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats } from '@/lib/types'

interface Team {
  team_num: number
  members: string[]
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

    const teamNums = [...new Set((teamsData || []).map((t: { team_num: number }) => t.team_num))]
    const teamList: Team[] = teamNums.map(num => {
      const mems = (teamsData || [])
        .filter((t: { team_num: number }) => t.team_num === num)
        .map((t: { member_nickname: string }) => t.member_nickname)
      const goalKm = mems.length * challenge.goal_km
      const totalDist = mems.reduce((s: number, n: string) => s + (distMap[n] || 0), 0)
      const shortfall = Math.max(0, goalKm - totalDist)
      return { team_num: num, members: mems, totalDist, goalKm, shortfall, fine: Math.round(shortfall * challenge.fine_per_km) }
    })

    setTeams(teamList)
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

  const fmt = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

  return (
    <div className="challenge-board">
      <div className="challenge-header">
        <h2>⚡ 챌린지 보드</h2>
        <p className="challenge-period">{fmt(period.start)} ~ {fmt(period.end)}</p>
        <p className="challenge-goal">목표: 1인당 {period.goal}km | 벤금: {period.fine.toLocaleString()}원/km</p>
      </div>
      <div className="teams-container">
        {teams.map(team => {
          const pct = Math.min((team.totalDist / team.goalKm) * 100, 100)
          const cleared = team.totalDist >= team.goalKm
          return (
            <div key={team.team_num} className={`team-card ${cleared ? 'cleared' : ''}`}>
              <div className="team-header">
                <h3>{team.team_num}팀</h3>
                {cleared
                  ? <span className="badge cleared">🎉 완주!</span>
                  : <span className="badge deficit">₩{team.fine.toLocaleString()} 예상벤금</span>}
              </div>
              <div className="team-members">
                {team.members.map(n => <span key={n} className="team-member-chip">{n}</span>)}
              </div>
              <div className="team-progress">
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                <div className="progress-labels">
                  <span>{team.totalDist.toFixed(1)}km</span>
                  <span>/ {team.goalKm.toFixed(0)}km</span>
                </div>
              </div>
              {!cleared && <div className="shortfall-info">{team.shortfall.toFixed(1)}km 부족</div>}
            </div>
          )
        })}
        {teams.length === 0 && <div className="empty-state">팀 구성이 없습니다.</div>}
      </div>
    </div>
  )
}
