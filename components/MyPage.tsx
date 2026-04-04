'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats, RollingScores } from '@/lib/types'
import { formatDist } from '@/lib/scoring'

const EGG_EMOJI: Record<string, string> = { star: '⭐', cloud: '☁️', moon: '🌙', heart: '❤️', sun: '☀️' }

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

const EN_LABELS: Record<string, string> = {
  '지구력': 'Endurance', '스피드': 'Speed', '꾸준함': 'Consistency',
  '효율': 'Efficiency', '롱런': 'Long Run'
}

function RadarChart({ scores }: { scores: Record<string, number> }) {
  const labels = ['지구력', '스피드', '꾸준함', '효율', '롱런']
  const keys = ['endurance', 'speed', 'consistency', 'efficiency', 'longRun']
  const values = keys.map(k => scores[k] || 0)
  const cx = 140, cy = 140, r = 80, n = labels.length

  function pt(angle: number, radius: number) {
    const rad = (angle - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  const gridLevels = [20, 40, 60, 80, 100]
  const dataPoints = values.map((v, i) => pt((360 / n) * i, (v / 100) * r))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <svg viewBox="0 0 280 280" className="retro-radar">
      {gridLevels.map((lvl, li) => {
        const pts = Array.from({ length: n }, (_, i) => pt((360 / n) * i, r * (lvl / 100)))
        return <path key={li} d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'} fill="none" stroke="#c9a" strokeWidth="0.5" />
      })}
      {Array.from({ length: n }, (_, i) => {
        const a = pt((360 / n) * i, r)
        return <line key={i} x1={cx} y1={cy} x2={a.x} y2={a.y} stroke="#c9a" strokeWidth="0.5" />
      })}
      <path d={dataPath} fill="rgba(165,28,48,0.25)" stroke="#A51C30" strokeWidth="2" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#A51C30" />)}
      {labels.map((label, i) => {
        const lp = pt((360 / n) * i, r + 38)
        return (
          <g key={i}>
            <text x={lp.x} y={lp.y - 6} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#333" fontWeight="700">{label}</text>
            <text x={lp.x} y={lp.y + 6} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#999">{EN_LABELS[label]}</text>
            <text x={lp.x} y={lp.y + 20} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#A51C30" fontWeight="700">{values[i].toFixed(0)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function MyPage({
  member, stats, rollingScores, currentUserId
}: {
  member: Member | null
  stats: SeasonStats | undefined
  rollingScores: RollingScores | undefined
  currentUserId: string | null
}) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUserId || !member) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `${currentUserId}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { setUploadingAvatar(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatarUrl = `${publicUrl}?t=${Date.now()}`
    await supabase.from('members').update({ avatar_url: avatarUrl }).eq('user_id', currentUserId)
    setUploadingAvatar(false)
    window.location.reload()
  }

  if (!member) {
    return (
      <div className="my-page-wrap">
        <div className="empty-state">
          <p>내 프로필을 찾을 수 없어요</p>
          <p className="empty-sub">
            {currentUserId ? '회원가입이 완료되지 않았거나 계정이 아직 연결 중이에요.' : '로그인이 필요해요.'}
          </p>
        </div>
      </div>
    )
  }

  const scores = {
    speed: rollingScores?.speed ?? stats?.speed_score ?? 0,
    endurance: rollingScores?.endurance ?? stats?.endurance_score ?? 0,
    longRun: rollingScores?.longRun ?? stats?.longrun_score ?? 0,
    consistency: rollingScores?.consistency ?? stats?.consistency_score ?? 0,
    efficiency: rollingScores?.efficiency ?? stats?.efficiency_score ?? 0,
  }
  const expPct = Math.min(member.exp_pct || 0, 100)
  const expBars = 10
  const filledBars = Math.round((expPct / 100) * expBars)

  return (
    <div className="retro-card-wrap">
      <div className="retro-card">
        {/* 상단: LV 닉네임 + EXP + 추첨권 */}
        <div className="retro-card-topbar">
          <div className="retro-topbar-left">
            <span className="retro-lv">LV {member.lv}</span>
            <span className="retro-nick">{member.nickname}</span>
          </div>
          <div className="retro-topbar-right">
            <div className="retro-exp-compact">
              {Array.from({ length: expBars }).map((_, i) => (
                <div key={i} className={`retro-exp-bar ${i < filledBars ? 'active' : ''}`} />
              ))}
            </div>
            <div className="retro-ticket-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><path d="M9 7v10"/></svg>
              <span>x {member.lottery_tickets || 0}</span>
            </div>
          </div>
        </div>

        {/* 캐릭터 영역 */}
        <div className="retro-char-area">
          <label className="retro-char-avatar-label">
            <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={uploadingAvatar} />
            {member.avatar_url ? (
              <img src={member.avatar_url} alt="" className="retro-char-avatar" />
            ) : (
              <div className="retro-char-emoji">{getCharEmoji(member.lv, member.egg_type)}</div>
            )}
            <div className="retro-char-edit-badge">{uploadingAvatar ? '...' : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6V4h8v2"/></svg>}</div>
          </label>
        </div>

        {/* 하단: 레이더 + 장비슬롯 */}
        <div className="retro-card-bottom">
          <div className="retro-radar-area">
            <RadarChart scores={scores} />
          </div>
          <div className="retro-equip-area">
            <div className="retro-equip-title">EQUIPMENT</div>
            <div className="retro-equip-grid">
              {[
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18c0-1 1-2 3-2h2l2-3h6l2 3h2c2 0 3 1 3 2v1H2v-1z"/><path d="M7 13V8c0-1 1-3 5-3s5 2 5 3v5"/></svg>, label: '신발' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12l-1 7H7L6 4z"/><path d="M6 4L4 8v12h16V8l-2-4"/><path d="M10 4v3a2 2 0 0 0 4 0V4"/></svg>, label: '상의' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="6"/><circle cx="12" cy="12" r="5"/><path d="M12 9v3l2 1"/></svg>, label: '시계' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3h5v3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3H3v3z"/></svg>, label: '악세' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16h20"/><path d="M4 16c0-6 3.5-10 8-10s8 4 8 10"/><circle cx="12" cy="10" r="1.5" fill="currentColor"/></svg>, label: '모자' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>, label: '뱃지' },
              ].map(({ icon, label }) => (
                <div key={label} className="retro-equip-slot" onClick={() => alert('준비중입니다')}>
                  <div className="retro-equip-icon">{icon}</div>
                  <div className="retro-equip-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 추첨권 */}
      <div className="retro-section">
        <div className="retro-section-header">
          <div className="retro-section-title">추첨권</div>
          <div className="retro-ticket-count">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A51C30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><path d="M9 7v10"/></svg>
            x {member.lottery_tickets || 0}
          </div>
        </div>
        <div className="retro-ticket-info">
          <div className="retro-ticket-row">
            <span>챌린지 완주</span>
            <span>= 추첨권 1개</span>
          </div>
          <div className="retro-ticket-row">
            <span>정기세션 참여</span>
            <span>= 추첨권 2개</span>
          </div>
          <div className="retro-ticket-desc">분기마다 추첨 후 리셋</div>
        </div>
      </div>
    </div>
  )
}
