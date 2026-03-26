'use client'

import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import { formatPace, formatDist } from '@/lib/scoring'

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

function RadarChart({ scores }: { scores: Record<string, number> }) {
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
    <svg viewBox="0 0 200 200" className="radar-chart">
      {[0.25, 0.5, 0.75, 1].map((lvl, li) => {
        const pts = Array.from({ length: n }, (_, i) => pt((360 / n) * i, r * lvl))
        return <path key={li} d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'} fill="none" stroke="#e0e0e0" strokeWidth="1" />
      })}
      {Array.from({ length: n }, (_, i) => {
        const a = pt((360 / n) * i, r)
        return <line key={i} x1={cx} y1={cy} x2={a.x} y2={a.y} stroke="#e0e0e0" strokeWidth="1" />
      })}
      <path d={dataPath} fill="rgba(0,0,0,0.12)" stroke="#000" strokeWidth="2" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#000" />)}
      {labels.map((label, i) => {
        const lp = pt((360 / n) * i, r + 16)
        return <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#666">{label}</text>
      })}
    </svg>
  )
}

export default function MyPage({
  member, stats, rollingScores, members, onSelectMember
}: {
  member: Member | null
  stats: SeasonStats | undefined
  rollingScores: RollingScores | undefined
  members: Member[]
  onSelectMember: (m: Member) => void
}) {
  if (!member) return <div className="empty-state"><p>🥚 회원을 선택해주세요</p></div>

  // 레이더 차트: 롤링 평균 우선, 없으면 현재 시즌 점수
  const scores = {
    speed: rollingScores?.speed ?? stats?.speed_score ?? 0,
    endurance: rollingScores?.endurance ?? stats?.endurance_score ?? 0,
    longRun: rollingScores?.longRun ?? stats?.longrun_score ?? 0,
    consistency: rollingScores?.consistency ?? stats?.consistency_score ?? 0,
    efficiency: rollingScores?.efficiency ?? stats?.efficiency_score ?? 0,
  }
  const expPct = Math.min(member.exp_pct || 0, 100)

  return (
    <div className="mypage">
      <div className="member-selector">
        {members.map(m => (
          <button key={m.nickname} className={`member-chip ${m.nickname === member.nickname ? 'active' : ''}`} onClick={() => onSelectMember(m)}>
            {m.nickname}
          </button>
        ))}
      </div>

      <div className="character-card" style={{ background: EGG_BG[member.egg_type] || '#f5f5f5' }}>
        <div className="card-header">
          <div className="lv-badge">LV.{member.lv}</div>
          <div className="nickname">{member.nickname}</div>
          {member.realname && <div className="realname">({member.realname})</div>}
        </div>
        <div className="character-display">
          <div className="character-emoji">{getCharEmoji(member.lv, member.egg_type)}</div>
        </div>
        <div className="exp-bar-container">
          <div className="exp-label">EXP {member.total_exp.toFixed(0)}</div>
          <div className="exp-bar"><div className="exp-fill" style={{ width: `${expPct}%` }} /></div>
          <div className="exp-pct">{expPct.toFixed(1)}%</div>
        </div>
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-value">{formatDist(member.total_dist)}</span>
            <span className="stat-label">누적거리</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{member.total_days}일</span>
            <span className="stat-label">러닝일수</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats?.total_score?.toFixed(1) || '0.0'}점</span>
            <span className="stat-label">시즌점수</span>
          </div>
        </div>
      </div>

      <div className="radar-section">
        <h3 className="section-title">⚡ 능력치</h3>
        <div className="radar-container"><RadarChart scores={scores} /></div>
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

      {stats && (
        <div className="season-stats-section">
          <h3 className="section-title">📊 시즌 기록</h3>
          <div className="stats-grid">
            <div className="stat-box"><div className="stat-box-val">{formatDist(stats.distance_km)}</div><div className="stat-box-label">시즌 총 거리</div></div>
            <div className="stat-box"><div className="stat-box-val">{formatDist(stats.longest_run_km)}</div><div className="stat-box-label">최장거리</div></div>
            <div className="stat-box"><div className="stat-box-val">{formatPace(stats.avg_pace_sec)}</div><div className="stat-box-label">평균 페이스</div></div>
            <div className="stat-box"><div className="stat-box-val">{stats.days_run}일</div><div className="stat-box-label">러닝일수</div></div>
          </div>
        </div>
      )}
    </div>
  )
}
