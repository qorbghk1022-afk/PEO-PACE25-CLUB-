'use client'

import type { Member, SeasonStats } from '@/lib/types'

const EGG_EMOJI: Record<string, string> = { star: '⭐', cloud: '☁️', moon: '🌙', heart: '❤️', sun: '☀️' }
const MEDALS = ['🥇', '🥈', '🥉']

export default function Ranking({
  members, seasonStats, onSelectMember
}: {
  members: Member[]
  seasonStats: SeasonStats[]
  onSelectMember: (m: Member) => void
}) {
  const memberMap = new Map(members.map(m => [m.nickname, m]))
  const sorted = [...seasonStats].sort((a, b) => b.total_score - a.total_score)

  return (
    <div className="ranking">
      <div className="ranking-header">
        <h2>🏆 시즌 랜킹</h2>
        <p className="ranking-sub">시즌 누적 점수 기준 | 클릭 → 마이페이지</p>
      </div>
      <div className="ranking-list">
        {sorted.map((stats, i) => {
          const member = memberMap.get(stats.member_nickname)
          if (!member) return null
          return (
            <div key={stats.member_nickname} className="ranking-row" onClick={() => onSelectMember(member)}>
              <div className="rank-num">{MEDALS[i] || `${i + 1}`}</div>
              <div className="rank-lv-badge">LV.{member.lv}</div>
              <div className="rank-info">
                <div className="rank-name">{stats.member_nickname}</div>
                <div className="rank-lv">@{stats.member_nickname}</div>
              </div>
              <div className="rank-scores">
                <div className="rank-score-main">{stats.total_score.toFixed(1)}점</div>
                <div className="rank-dist">{stats.distance_km.toFixed(1)}km</div>
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <div className="empty-state">
            <p>📊 랜킹 데이터가 없습니다.</p>
            <p className="empty-sub">/api/seed를 호출해서 시드 데이터를 로드하세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}
