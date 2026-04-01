'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
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
      <path d={dataPath} fill="rgba(165,28,48,0.15)" stroke="#A51C30" strokeWidth="2" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#A51C30" />)}
      {labels.map((label, i) => {
        const lp = pt((360 / n) * i, r + 16)
        return <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#666">{label}</text>
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
  const router = useRouter()
  const [profile, setProfile] = useState<{ real_name: string; phone: string; address: string } | null>(null)
  const [editingNickname, setEditingNickname] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [nicknameMsg, setNicknameMsg] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (currentUserId) {
      fetch(`/api/profile/get?userId=${currentUserId}`)
        .then(r => r.json())
        .then(setProfile)
    }
  }, [currentUserId])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleDeleteAccount() {
    if (!currentUserId) return
    setDeleting(true)
    await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId }),
    })
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleNicknameSave() {
    if (!newNickname.trim() || !member) return
    setSavingNickname(true)
    const { data: existing } = await supabase
      .from('members').select('nickname').eq('nickname', newNickname.trim()).maybeSingle()
    if (existing) { setNicknameMsg('이미 사용 중인 닉네임이에요'); setSavingNickname(false); return }
    await supabase.from('members').update({ nickname: newNickname.trim() }).eq('nickname', member.nickname)
    setNicknameMsg('저장됐어요')
    setEditingNickname(false)
    setSavingNickname(false)
    window.location.reload()
  }

  if (!member) {
    return (
      <div className="my-page-wrap">
        <div className="empty-state">
          <p>🥚 내 프로필을 찾을 수 없어요</p>
          <p className="empty-sub">
            {currentUserId
              ? '회원가입이 완료되지 않았거나 계정이 아직 연결 중이에요.'
              : '로그인이 필요해요.'}
          </p>
          <button
            className="login-btn-main"
            style={{ marginTop: 24, maxWidth: 240 }}
            onClick={() => window.location.reload()}
          >
            다시 시도
          </button>
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

  return (
    <div className="my-page-wrap">
      {/* 캐릭터 카드 */}
      <div className="character-card" style={{ background: EGG_BG[member.egg_type] || '#f5f5f5' }}>
        <div className="card-header">
          <div className="lv-badge">LV.{member.lv}</div>
          <div className="nickname">{member.nickname}</div>
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

      {/* 능력치 */}
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

      {/* 설정 */}
      <div className="settings-section">
        {/* 내 정보 */}
        <div className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-title">내 정보</span>
            {!editingNickname && (
              <button className="settings-edit-btn" onClick={() => { setEditingNickname(true); setNewNickname(member.nickname); setNicknameMsg('') }}>
                닉네임 수정
              </button>
            )}
          </div>
          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">닉네임</span>
              {editingNickname ? (
                <div className="nickname-edit-row">
                  <input className="info-input" value={newNickname} onChange={e => { setNewNickname(e.target.value); setNicknameMsg('') }} />
                  <button className="info-save-btn" onClick={handleNicknameSave} disabled={savingNickname}>저장</button>
                  <button className="info-cancel-btn" onClick={() => { setEditingNickname(false); setNicknameMsg('') }}>취소</button>
                </div>
              ) : (
                <span className="info-value">{member.nickname}</span>
              )}
            </div>
            {nicknameMsg && <p className="info-msg">{nicknameMsg}</p>}
            <div className="info-row">
              <span className="info-label">실명</span>
              <span className="info-value">{profile?.real_name || '-'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">전화번호</span>
              <span className="info-value">{profile?.phone || '-'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">주소</span>
              <span className="info-value info-address">{profile?.address || '-'}</span>
            </div>
          </div>
        </div>

        {/* 약관 */}
        <div className="settings-card settings-links">
          <a href="/policy/terms" className="settings-link-row">
            <span>서비스 이용약관</span><span className="settings-chevron">›</span>
          </a>
          <a href="/policy/privacy" className="settings-link-row">
            <span>개인정보 처리방침</span><span className="settings-chevron">›</span>
          </a>
          <a href="/policy/all" className="settings-link-row">
            <span>이용 약관 및 방침</span><span className="settings-chevron">›</span>
          </a>
        </div>

        {/* 로그아웃 / 탈퇴 */}
        <div className="settings-card settings-links">
          <button className="settings-link-row logout-btn" onClick={handleLogout}>
            <span>로그아웃</span><span className="settings-chevron">›</span>
          </button>
          <button className="settings-link-row delete-btn" onClick={() => setShowDeleteConfirm(true)}>
            <span>회원탈퇴</span><span className="settings-chevron">›</span>
          </button>
        </div>
      </div>

      {/* 탈퇴 확인 모달 */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">정말 탈퇴할까요?</p>
            <p className="modal-desc">탈퇴 시 모든 개인정보가 삭제돼요. 러닝 기록은 유지돼요.</p>
            <div className="modal-btns">
              <button className="modal-cancel" onClick={() => setShowDeleteConfirm(false)}>취소</button>
              <button className="modal-confirm" onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
