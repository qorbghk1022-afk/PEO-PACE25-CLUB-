'use client'

import { useState } from 'react'
import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import { formatDist } from '@/lib/scoring'

interface RankedMember {
  nickname: string
  member: Member
  totalScore: number
  scores: {
    speed: number
    endurance: number
    longRun: number
    consistency: number
    efficiency: number
  }
}

export default function Ranking({
  members, seasonStats, rollingScores
}: {
  members: Member[]
  seasonStats: SeasonStats[]
  rollingScores: Record<string, RollingScores>
}) {
  const [selected, setSelected] = useState<RankedMember | null>(null)

  // 3개월 롤링 기준 랭킹 (중복 닉네임 없이)
  const ranked: RankedMember[] = members
    .map(m => {
      const rolling = rollingScores[m.nickname]
      const latestStats = seasonStats.find(s => s.member_nickname === m.nickname)
      const scores = {
        speed: rolling?.speed ?? latestStats?.speed_score ?? 0,
        endurance: rolling?.endurance ?? latestStats?.endurance_score ?? 0,
        longRun: rolling?.longRun ?? latestStats?.longrun_score ?? 0,
        consistency: rolling?.consistency ?? latestStats?.consistency_score ?? 0,
        efficiency: rolling?.efficiency ?? latestStats?.efficiency_score ?? 0,
      }
      const totalScore = scores.speed * 0.3 + scores.endurance * 0.25 + scores.longRun * 0.15 + scores.consistency * 0.2 + scores.efficiency * 0.1
      return { nickname: m.nickname, member: m, totalScore, scores }
    })
    .sort((a, b) => b.totalScore - a.totalScore)

  // 3개월 범위 계산
  const now = new Date()
  const threeMonthsAgo = new Date(now)
  threeMonthsAgo.setMonth(now.getMonth() - 3)
  const rangeStart = `${threeMonthsAgo.getFullYear()}.${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}.${String(threeMonthsAgo.getDate()).padStart(2, '0')}`
  const rangeEnd = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="rank-wrap">
      <div className="rank-header-bar">
        <div className="rank-header-title">SEASON RANKING</div>
        <div className="rank-header-sub">3개월 롤링 평균 | {rangeStart} ~ {rangeEnd}</div>
      </div>

      <div className="rank-table-wrap">
        <table className="rank-table">
          <thead>
            <tr>
              <th>#</th>
              <th>LV</th>
              <th>RUNNER</th>
              <th>SCORE</th>
              <th>DIST</th>
              <th>TICKET</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const isTop3 = i < 3
              return (
                <tr
                  key={r.nickname}
                  className={`rank-row ${isTop3 ? `rank-top${i + 1}` : ''} ${selected?.nickname === r.nickname ? 'rank-selected' : ''}`}
                  onClick={() => setSelected(selected?.nickname === r.nickname ? null : r)}
                >
                  <td className="rank-pos">{i + 1}</td>
                  <td>{r.member.lv}</td>
                  <td className="rank-runner">{r.nickname}</td>
                  <td className="rank-score">{r.totalScore.toFixed(1)}</td>
                  <td>{formatDist(r.member.total_dist)}</td>
                  <td>{r.member.lottery_tickets || 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 선택된 멤버 상세 */}
      {selected && (
        <div className="rank-detail">
          <div className="rank-detail-header">
            <span className="rank-detail-name">LV.{selected.member.lv} {selected.nickname}</span>
            <button className="rank-detail-close" onClick={() => setSelected(null)}>x</button>
          </div>
          <div className="rank-detail-stats">
            {([
              ['지구력', selected.scores.endurance],
              ['스피드', selected.scores.speed],
              ['롱런', selected.scores.longRun],
              ['꾸준함', selected.scores.consistency],
              ['효율', selected.scores.efficiency],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="rank-detail-item">
                <span className="rank-detail-label">{label}</span>
                <div className="rank-detail-bar"><div style={{ width: `${val}%` }} /></div>
                <span className="rank-detail-val">{val.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <div className="rank-detail-footer">
            {formatDist(selected.member.total_dist)} | {selected.member.total_days}일 | 추첨권 {selected.member.lottery_tickets || 0}장
          </div>
        </div>
      )}

      {ranked.length === 0 && (
        <div className="empty-state"><p>랭킹 데이터가 없어요.</p></div>
      )}
    </div>
  )
}
