'use client'

import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import { formatDist } from '@/lib/scoring'

const EGG_EMOJI: Record<string, string> = { star: '⭐', cloud: '☁️', moon: '🌙', heart: '❤️', sun: '☀️' }
const EGG_BG: Record<string, string> = { star: '#fffde7', cloud: '#e3f2fd', moon: '#f3e5f5', heart: '#fce4ec', sun: '#fff3e0' }

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

function MiniRadar({ scores }: { scores: Record<string, number> }) {
  const labels = ['지구력', '스피드', '꾸준함', '효율', '롱런']
  const keys = ['endurance', 'speed', 'consistency', 'efficiency', 'longRun']
  const values = keys.map(k => scores[k] || 0)
  const cx = 80, cy = 80, r = 55, n = labels.length

  function pt(angle: number, radius: number) {
    const rad = (angle - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  const dataPoints = values.map((v, i) => pt((360 / n) * i, (v / 100) * r))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <svg viewBox="0 0 160 160" style={{ width: 140, height: 140 }}>
      {[0.5, 1].map((lvl, li) => {
        const pts = Array.from({ length: n }, (_, i) => pt((360 / n) * i, r * lvl))
        return <path key={li} d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'} fill="none" stroke="#ddd" strokeWidth="0.5" />
      })}
      <path d={dataPath} fill="rgba(165,28,48,0.2)" stroke="#A51C30" strokeWidth="1.5" />
      {labels.map((label, i) => {
        const lp = pt((360 / n) * i, r + 18)
        return <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#666" fontWeight="600">{label}</text>
      })}
    </svg>
  )
}

export default function ProfilePopup({
  member, stats, rolling, onClose
}: {
  member: Member
  stats?: SeasonStats
  rolling?: RollingScores
  onClose: () => void
}) {
  const scores = {
    speed: rolling?.speed ?? stats?.speed_score ?? 0,
    endurance: rolling?.endurance ?? stats?.endurance_score ?? 0,
    longRun: rolling?.longRun ?? stats?.longrun_score ?? 0,
    consistency: rolling?.consistency ?? stats?.consistency_score ?? 0,
    efficiency: rolling?.efficiency ?? stats?.efficiency_score ?? 0,
  }

  return (
    <div className="pp-overlay" onClick={onClose}>
      <div className="pp-card" onClick={e => e.stopPropagation()}>
        <button className="pp-close" onClick={onClose}>x</button>

        <div className="pp-top" style={{ background: EGG_BG[member.egg_type] || '#f5f5f5' }}>
          {member.avatar_url ? (
            <img src={member.avatar_url} alt="" className="pp-avatar" />
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          )}
        </div>

        <div className="pp-info">
          <div className="pp-lv">LV.{member.lv}</div>
          <div className="pp-name">{member.nickname}</div>
        </div>

        <div className="pp-stats">
          <div className="pp-stat">
            <span className="pp-stat-val">{formatDist(member.total_dist)}</span>
            <span className="pp-stat-label">누적거리</span>
          </div>
          <div className="pp-stat">
            <span className="pp-stat-val">{member.total_days}일</span>
            <span className="pp-stat-label">러닝일수</span>
          </div>
          <div className="pp-stat">
            <span className="pp-stat-val">{stats?.total_score?.toFixed(1) || '-'}</span>
            <span className="pp-stat-label">점수</span>
          </div>
        </div>

        <div className="pp-radar">
          <MiniRadar scores={scores} />
        </div>
      </div>
    </div>
  )
}
