'use client'

import { useState } from 'react'
import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import { formatPace, formatDist } from '@/lib/scoring'

const EGG_EMOJI: Record<string, string> = { star: '⭐', cloud: '☁️', moon: '🌙', heart: '❤️', sun: '☀️' }
const EGG_BG: Record<string, string> = { star: '#fffde7', cloud: '#e3f2fd', moon: '#f3e5f5', heart: '#fce4ec', sun: '#fff3e0' }
const MEDALS = ['🥇', '🥈', '🥉']

function getCharEmoji(lv: number, eggType: string) {
  const egg = EGG_EMOJI[eggType] || '🥚'
  if (lv <= 5) return egg
  if (lv <= 10) return `${egg}👣`
  if (lv <= 15) return `${egg}🤞`
  if (lv <= 20) return '🟢'
  if (lv <= 30) return '💚'
  if (lv <= 40) return '🌿'
  if (lv <= 50) return '🏃'
  if (lv <= 70) return '⚡🏃'
  return '🌟🏃'
}

function RadarMini({ scores }: { scores: Record<string, number> }) {
  const labels = ['스피드', '지구력', '롱런', '꾸준함', '효율성']
  const values = [scores.speed || 0, scores.endurance || 0, scores.longRun || 0, scores.consistency || 0, scores.efficiency || 0]
  const cx = 100, cy = 100, r = 75, n = labels.length
  function pt(angle: number, radius: number) {
    const rad = (angle - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }
  const dataPoints = values.map((v, i) => pt((360 / n) * i, (v / 100) * r))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
      {[0.25, 0.5, 0.75, 1].map((lvl, li) => {
        const pts = Array.from({ length: n }, (_, i) => pt((360 / n) * i, r * lvl))
        return <path key={li} d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'} fill="none" stroke="#e0e0e0" strokeWidth="1" />
      })}
      {Array.from({ length: n }, (_, i) => {
        const a = pt((360 / n) * i, r)
        return <line key={i} x1={cx} y1={cy} x2={a.x} y2={a.y} stroke="#e0e0e0" strokeWidth="1" />
      })}
      <path d={dataPath} fill="rgba(165,28,48,0.15)" stroke="#A51C30" strokeWidth="2" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#A51C30" />)}
      {labels.map((label, i) => {
        const lp = pt((360 / n) * i, r + 16)
        return <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#666">{label}</text>
      })}
    </svg>
  )
}

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
    <div className="ranking">
      <div className="ranking-header">
        <h2>🏆 시즌 랜킹</h2>
        <p className="ranking-sub">시즌 누적 점수 기준 | 클릭 → 프로필 보기</p>
      </div>
      <div className="ranking-list">
        {sorted.map((stats, i) => {
          const member = memberMap.get(stats.member_nickname)
          if (!member) return null
          return (
            <div key={stats.member_nickname} className="ranking-row" onClick={() => setSelected(member)}>
              <div className="rank-num">{MEDALS[i] || `${i + 1}`}</div>
              <div className="rank-lv-badge">LV.{member.lv}</div>
              <div className="rank-info">
                <div className="rank-name">{stats.member_nickname}</div>
                <div className="rank-lv">{EGG_EMOJI[member.egg_type] || '🥚'}</div>
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
            <p>📊 랜킹 데이터가 없어요.</p>
          </div>
        )}
      </div>

      {/* 멤버 프로필 모달 */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <button className="profile-modal-close" onClick={() => setSelected(null)}>✕</button>

            {/* 캐릭터 카드 */}
            <div className="profile-modal-card" style={{ background: EGG_BG[selected.egg_type] || '#f5f5f5' }}>
              <div className="profile-modal-header">
                <div className="lv-badge">LV.{selected.lv}</div>
                <div className="nickname">{selected.nickname}</div>
              </div>
              <div className="character-display">
                <div className="character-emoji">{getCharEmoji(selected.lv, selected.egg_type)}</div>
              </div>
              <div className="stats-row">
                <div className="stat-item">
                  <span className="stat-value">{formatDist(selected.total_dist)}</span>
                  <span className="stat-label">누적거리</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{selected.total_days}일</span>
                  <span className="stat-label">러닝일수</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{selectedStats?.total_score?.toFixed(1) || '0.0'}점</span>
                  <span className="stat-label">시즌점수</span>
                </div>
              </div>
            </div>

            {/* 능력치 */}
            {scores && (
              <div className="profile-modal-radar">
                <div className="section-title">⚡ 능력치</div>
                <div style={{ width: 160, margin: '0 auto 12px' }}>
                  <RadarMini scores={scores} />
                </div>
                <div className="score-breakdown">
                  {([
                    ['🏃 스피드', scores.speed],
                    ['💪 지구력', scores.endurance],
                    ['🦁 롱런', scores.longRun],
                    ['📅 꾸준함', scores.consistency],
                    ['⚡ 효율성', scores.efficiency],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="score-item">
                      <span className="score-label">{label}</span>
                      <div className="score-bar-mini"><div style={{ width: `${val}%` }} /></div>
                      <span className="score-num">{val.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 시즌 기록 */}
            {selectedStats && (
              <div className="profile-modal-season">
                <div className="section-title">📊 시즌 기록</div>
                <div className="stats-grid">
                  <div className="stat-box"><div className="stat-box-val">{formatDist(selectedStats.distance_km)}</div><div className="stat-box-label">시즌 총 거리</div></div>
                  <div className="stat-box"><div className="stat-box-val">{formatDist(selectedStats.longest_run_km)}</div><div className="stat-box-label">최장거리</div></div>
                  <div className="stat-box"><div className="stat-box-val">{formatPace(selectedStats.avg_pace_sec)}</div><div className="stat-box-label">평균 페이스</div></div>
                  <div className="stat-box"><div className="stat-box-val">{selectedStats.days_run}일</div><div className="stat-box-label">러닝일수</div></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
