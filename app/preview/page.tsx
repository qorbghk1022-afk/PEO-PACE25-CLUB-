'use client'

import { useState } from 'react'
import GachaMachine from '@/components/GachaMachine'

const PATTERNS = [
  { type: 'star', emoji: '⭐', name: '별' },
  { type: 'cloud', emoji: '☁️', name: '구름' },
  { type: 'moon', emoji: '🌙', name: '달' },
  { type: 'sun', emoji: '☀️', name: '해' },
  { type: 'fire', emoji: '🔥', name: '불' },
  { type: 'water', emoji: '💧', name: '물' },
  { type: 'earth', emoji: '🌍', name: '대지' },
  { type: 'lightning', emoji: '⚡', name: '번개' },
  { type: 'grass', emoji: '🌿', name: '풀' },
]
const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A8E6CF', '#FFB347', '#C3B1E1', '#F8B500', '#87CEEB', '#FF9AA2', '#B5EAD7']
const EYES = [
  { type: 'default', display: '◉ ◉' },
  { type: 'round', display: '◎ ◎' },
  { type: 'sleepy', display: '─ ─' },
  { type: 'smile', display: '^ ^' },
  { type: 'angry', display: '> <' },
]

const SCREENS = ['온보딩', '크루선택', '크루만들기', '크루찾기', '챌린지', '추첨', '캘린더', 'MY', '크루관리']

export default function PreviewPage() {
  const [screen, setScreen] = useState('온보딩')

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#111' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 200, background: '#222',
        padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 4,
        borderBottom: '2px solid #A51C30',
      }}>
        <span style={{ color: '#A51C30', fontWeight: 700, fontSize: 11, marginRight: 6, lineHeight: '26px' }}>PREVIEW</span>
        {SCREENS.map(s => (
          <button key={s} onClick={() => setScreen(s)} style={{
            padding: '3px 8px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            background: screen === s ? '#A51C30' : '#444', color: '#fff',
          }}>{s}</button>
        ))}
      </div>

      {screen === '온보딩' && <OnboardingDemo />}
      {screen === '크루선택' && <CrewSelectDemo />}
      {screen === '크루만들기' && <CrewCreateDemo />}
      {screen === '크루찾기' && <CrewBrowseDemo />}
      {screen === '챌린지' && <ChallengeDemo />}
      {screen === '추첨' && <DrawDemo />}
      {screen === '캘린더' && <CalendarDemo />}
      {screen === 'MY' && <MyPageDemo />}
      {screen === '크루관리' && <AdminDemo />}
    </div>
  )
}

function OnboardingDemo() {
  const [selected, setSelected] = useState<string | null>(null)
  const [phase, setPhase] = useState<'select' | 'reveal' | 'born'>('select')
  const [config, setConfig] = useState({ pattern: '', color: '', eyes: '' })

  function handleSelect(type: string) {
    setSelected(type)
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const eyes = EYES[Math.floor(Math.random() * EYES.length)].type
    setConfig({ pattern: type, color, eyes })
    setTimeout(() => setPhase('reveal'), 800)
    setTimeout(() => setPhase('born'), 2500)
  }

  function reset() { setSelected(null); setPhase('select'); setConfig({ pattern: '', color: '', eyes: '' }) }

  return (
    <div className="ob-page" style={{ minHeight: 'auto' }}>
      <div className="ob-body">
        {phase === 'select' && (
          <>
            <h1 className="ob-title">당신은 어떤 유형의 러너입니까?</h1>
            <p className="ob-subtitle">속성을 선택하세요</p>
            <div className="ob-grid">
              {PATTERNS.map(p => (
                <button key={p.type}
                  className={`ob-attr ${selected === p.type ? 'ob-attr-selected' : ''} ${selected && selected !== p.type ? 'ob-attr-fade' : ''}`}
                  onClick={() => !selected && handleSelect(p.type)}>
                  <span className="ob-attr-emoji">{p.emoji}</span>
                  <span className="ob-attr-name">{p.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {phase === 'reveal' && (
          <div className="ob-reveal">
            <div className="ob-reveal-glow" />
            <div className="ob-reveal-egg">
              <EggSVG pattern={config.pattern} color={config.color} eyes={config.eyes} size={140} />
            </div>
            <p className="ob-reveal-text">알이 만들어지고 있어요...</p>
          </div>
        )}
        {phase === 'born' && (
          <div className="ob-born">
            <div className="ob-born-egg">
              <EggSVG pattern={config.pattern} color={config.color} eyes={config.eyes} size={160} />
            </div>
            <h2 className="ob-born-title">알이 탄생했어요!</h2>
            <p className="ob-born-desc">
              {PATTERNS.find(p => p.type === config.pattern)?.emoji}{' '}
              {PATTERNS.find(p => p.type === config.pattern)?.name} 속성 ·{' '}
              {EYES.find(e => e.type === config.eyes)?.display} 눈
            </p>
            <button className="ob-confirm" onClick={reset}>다시 해보기</button>
          </div>
        )}
      </div>
    </div>
  )
}

function EggSVG({ pattern, color, eyes, size = 120 }: { pattern: string; color: string; eyes: string; size?: number }) {
  const p = PATTERNS.find(x => x.type === pattern)
  const e = EYES.find(x => x.type === eyes)
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2}>
      <ellipse cx="50" cy="65" rx="38" ry="48" fill={color} stroke="#333" strokeWidth="2.5" />
      <ellipse cx="50" cy="65" rx="38" ry="48" fill="rgba(255,255,255,0.15)" />
      <text x="50" y="55" textAnchor="middle" fontSize="20">{e?.display || '◉ ◉'}</text>
      <text x="50" y="90" textAnchor="middle" fontSize="22">{p?.emoji || '⭐'}</text>
    </svg>
  )
}

function CrewSelectDemo() {
  return (
    <div style={{ background: '#fff', minHeight: '70vh', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <img src="/peo-logo-black.png" alt="PEO" style={{ height: 32 }} />
      </header>
      <h1 style={{ fontSize: 14, fontWeight: 600, color: '#999', textAlign: 'center', marginBottom: 24 }}>크루를 선택하세요</h1>
      <div style={{ display: 'flex', gap: 12 }}>
        {['크루 만들기', '크루 찾기'].map(t => (
          <div key={t} style={{ flex: 1, padding: '30px 12px', borderRadius: 16, background: '#f5f5f5', textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#333' }}>{t}</div>
        ))}
      </div>
    </div>
  )
}

function CrewCreateDemo() {
  return (
    <div style={{ background: '#fff', minHeight: '70vh', padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>어떤 크루를 만들까요?</h2>
      <div style={{ width: 100, height: 100, borderRadius: '50%', border: '2px dashed #ddd', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 11 }}>크루 이미지</div>
      <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>크루명</label>
      <input style={{ width: '100%', padding: 14, border: '1.5px solid #e0e0e0', borderRadius: 10, fontSize: 15, marginBottom: 16 }} placeholder="20글자 이하로 입력해주세요" />
      <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>소개</label>
      <textarea style={{ width: '100%', padding: 14, border: '1.5px solid #e0e0e0', borderRadius: 10, fontSize: 15, resize: 'none', marginBottom: 20 }} rows={3} placeholder="나의 크루를 소개해주세요" />
      <button style={{ width: '100%', padding: 16, background: '#A51C30', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700 }}>크루 생성</button>
    </div>
  )
}

function CrewBrowseDemo() {
  const crews = [
    { name: 'PEO', color: '#A51C30', count: 26 },
    { name: 'HRC', color: '#e74c3c', count: 12 },
    { name: 'RUN', color: '#2d5fa0', count: 8 },
    { name: 'JOG', color: '#27ae60', count: 15 },
  ]
  return (
    <div style={{ background: '#111', minHeight: '70vh', padding: 24, textAlign: 'center' }}>
      <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginBottom: 30 }}>크루 찾기</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
        {crews.map(c => (
          <div key={c.name} style={{
            width: 100, height: 100, borderRadius: '50%', background: c.color,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer',
          }}>
            {c.name}
            <span style={{ fontSize: 10, opacity: 0.6 }}>{c.count}명</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChallengeDemo() {
  return (
    <div style={{ background: '#f5f5f5', padding: 16 }}>
      <div className="cb-mode-toggle">
        <button className="cb-mode-btn active">2주</button>
        <button className="cb-mode-btn">3개월</button>
        <button className="cb-mode-btn">전체</button>
      </div>
      <div className="cb-header" style={{ marginTop: 12 }}>
        <div className="cb-header-row1"><div className="cb-title">2-Week Run Challenge</div><div className="cb-goal-km">15KM</div></div>
        <div className="cb-header-row2"><span className="cb-nav-label">2026-03-23 ~ 2026-04-05</span><div className="cb-goal-pct">42%</div></div>
      </div>
      <div style={{ background: '#f5efe6', border: '3px solid #333', padding: 16, textAlign: 'center', color: '#999', fontSize: 13 }}>
        챌린지 테이블 (로그인 시 데이터 표시)
      </div>
      <div className="cb-total"><div className="cb-total-label">의지박약 외주비 합계</div><div className="cb-total-value">₩245,000</div></div>
    </div>
  )
}

function DrawDemo() {
  return (
    <div style={{ padding: 16 }}>
      <div className="draw-header">
        <div className="draw-header-row1"><div className="draw-header-title">SEASON DRAW</div><div className="draw-header-dday">D-15</div></div>
        <div className="draw-header-row2">
          <span className="draw-nav-arrow">‹</span>
          <span className="draw-nav-label">2026-01-20 ~ 2026-04-19</span>
          <span className="draw-nav-arrow">›</span>
          <span className="draw-header-pct">83%</span>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <GachaMachine ticketCount={5} totalBalls={5} disabled={true} />
      </div>
      <div className="draw-my-tickets" style={{ marginTop: 16 }}>
        <div className="draw-tickets-header"><span>내 추첨권</span><span className="draw-tickets-count">5장 / 최대 12장</span></div>
        <div className="draw-tickets-row">
          <span className="draw-tickets-label">챌린지 완주</span>
          <div className="draw-tickets-checks">
            {[true, true, true, false, false, false].map((c, i) => (
              <span key={i} className={`draw-check ${c ? 'checked' : ''}`}>{c ? '✓' : '○'}</span>
            ))}
          </div>
          <span className="draw-tickets-sub">3/6장</span>
        </div>
      </div>
    </div>
  )
}

function CalendarDemo() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  const runDays = [1, 3, 5, 7, 8, 10, 12, 14, 15, 18, 20, 22, 25, 28]
  return (
    <div style={{ padding: 16 }}>
      <div className="retro-period-toggle">
        <button className="retro-period-btn">주</button>
        <button className="retro-period-btn active">월</button>
        <button className="retro-period-btn">년</button>
        <button className="retro-period-btn">전체</button>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginTop: 12 }}>
        <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: 12 }}>2026년 4월</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {['일','월','화','수','목','금','토'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#999', padding: 4 }}>{d}</div>
          ))}
          {Array.from({ length: 2 }, (_, i) => <div key={`e${i}`} />)}
          {days.map(d => (
            <div key={d} style={{ textAlign: 'center', padding: 6, fontSize: 12, borderRadius: 8, background: runDays.includes(d) ? '#fff8f5' : 'transparent' }}>
              {d}
              {runDays.includes(d) && <div style={{ marginTop: 2 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="#A51C30" stroke="none"><ellipse cx="12" cy="13" rx="8" ry="10"/></svg></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MyPageDemo() {
  return (
    <div style={{ padding: 16 }}>
      <div className="retro-card">
        <div className="retro-card-topbar">
          <div className="retro-topbar-left"><span className="retro-lv">LV 13</span><span className="retro-nick">JM</span></div>
          <div className="retro-topbar-right">
            <div className="retro-exp-compact">{Array.from({ length: 10 }).map((_, i) => (<div key={i} className={`retro-exp-bar ${i < 7 ? 'active' : ''}`} />))}</div>
          </div>
        </div>
        <div className="retro-char-area" style={{ minHeight: 200 }}>
          <div style={{ fontSize: 80 }}>⭐🤞</div>
        </div>
        <div className="retro-card-bottom">
          <div className="retro-radar-area" style={{ padding: 20 }}>
            <div style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>레이더 차트</div>
          </div>
          <div className="retro-equip-area">
            <div className="retro-equip-title">EQUIPMENT</div>
            <div className="retro-equip-grid">
              {['신발','상의','시계','악세','모자','뱃지'].map(l => (
                <div key={l} className="retro-equip-slot"><div className="retro-equip-label">{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminDemo() {
  const members = ['JM', '백화', '연', '머룬', '진원', '혀노', '네모러너']
  return (
    <div style={{ background: '#fff', minHeight: '70vh' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 18, textAlign: 'center' }}>HRC 관리</div>
      <div className="admin-tabs">
        <button className="admin-tab active">회원 (26)</button>
        <button className="admin-tab">가입신청 (2)</button>
        <button className="admin-tab">시즌 관리</button>
      </div>
      <div style={{ padding: 16 }}>
        {members.map(m => (
          <div key={m} className="admin-member-row">
            <div className="admin-member-info">
              <span className="admin-member-name">{m}</span>
              <span className="admin-member-sub">LV.13 | 250.0km</span>
            </div>
            <button className="admin-kick-btn">강퇴</button>
          </div>
        ))}
      </div>
    </div>
  )
}
