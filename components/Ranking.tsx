'use client'

import { useState } from 'react'
import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import { formatDist } from '@/lib/scoring'

export default function Ranking({
  members, seasonStats, rollingScores
}: {
  members: Member[]
  seasonStats: SeasonStats[]
  rollingScores: Record<string, RollingScores>
}) {
  const [selected, setSelected] = useState<Member | null>(null)

  const memberMap = new Map(members.map(m => [m.nickname, m]))
  const statsMap = new Map(seasonStats.map(s => [s.member_nickname, s]))
  const sorted = [...seasonStats].sort((a, b) => b.total_score - a.total_score)

  const selectedStats = selected ? statsMap.get(selected.nickname) : undefined
  const selectedRolling = selected ? rollingScores[selected.nickname] : undefined
  const scores = selected ? {
    speed: selectedRolling?.speed ?? selectedStats?.speed_score ?? 0,
    endurance: selectedRolling?.endurance ?? selectedStats?.endurance_score ?? 0,
    longRun: selectedRolling?.longRun ?? selectedStats?.longrun_score ?? 0,
    consistency: selectedRolling?.consistency ?? selectedStats?.consistency_score ?? 0,
    efficiency: selectedRolling?.efficiency ?? selectedStats?.efficiency_score ?? 0,
  } : null

  return (
    <div className="rank-wrap">
      <div className="rank-header-bar">
        <div className="rank-header-title">SEASON RANKING</div>
        <div className="rank-header-sub">시즌 누적 점수 기준</div>
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
            {sorted.map((stats, i) => {
              const member = memberMap.get(stats.member_nickname)
              if (!member) return null
              const isTop3 = i < 3
              return (
                <tr
                  key={stats.member_nickname}
                  className={`rank-row ${isTop3 ? `rank-top${i + 1}` : ''} ${selected?.nickname === member.nickname ? 'rank-selected' : ''}`}
                  onClick={() => setSelected(selected?.nickname === member.nickname ? null : member)}
                >
                  <td className="rank-pos">{i + 1}</td>
                  <td>{member.lv}</td>
                  <td className="rank-runner">{stats.member_nickname}</td>
                  <td className="rank-score">{stats.total_score.toFixed(1)}</td>
                  <td>{formatDist(stats.distance_km)}</td>
                  <td>{member.lottery_tickets || 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 선택된 멤버 상세 */}
      {selected && scores && (
        <div className="rank-detail">
          <div className="rank-detail-header">
            <span className="rank-detail-name">LV.{selected.lv} {selected.nickname}</span>
            <button className="rank-detail-close" onClick={() => setSelected(null)}>x</button>
          </div>
          <div className="rank-detail-stats">
            <div className="rank-detail-item">
              <span className="rank-detail-label">지구력</span>
              <div className="rank-detail-bar"><div style={{ width: `${scores.endurance}%` }} /></div>
              <span className="rank-detail-val">{scores.endurance.toFixed(0)}</span>
            </div>
            <div className="rank-detail-item">
              <span className="rank-detail-label">스피드</span>
              <div className="rank-detail-bar"><div style={{ width: `${scores.speed}%` }} /></div>
              <span className="rank-detail-val">{scores.speed.toFixed(0)}</span>
            </div>
            <div className="rank-detail-item">
              <span className="rank-detail-label">롱런</span>
              <div className="rank-detail-bar"><div style={{ width: `${scores.longRun}%` }} /></div>
              <span className="rank-detail-val">{scores.longRun.toFixed(0)}</span>
            </div>
            <div className="rank-detail-item">
              <span className="rank-detail-label">꾸준함</span>
              <div className="rank-detail-bar"><div style={{ width: `${scores.consistency}%` }} /></div>
              <span className="rank-detail-val">{scores.consistency.toFixed(0)}</span>
            </div>
            <div className="rank-detail-item">
              <span className="rank-detail-label">효율</span>
              <div className="rank-detail-bar"><div style={{ width: `${scores.efficiency}%` }} /></div>
              <span className="rank-detail-val">{scores.efficiency.toFixed(0)}</span>
            </div>
          </div>
          <div className="rank-detail-footer">
            {formatDist(selected.total_dist)} | {selected.total_days}일 | 추첨권 {selected.lottery_tickets || 0}장
          </div>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="empty-state"><p>랭킹 데이터가 없어요.</p></div>
      )}
    </div>
  )
}
