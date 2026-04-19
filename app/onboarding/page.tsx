'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

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

function EggVisual({ pattern, color, eyes, size = 120 }: { pattern: string; color: string; eyes: string; size?: number }) {
  const p = PATTERNS.find(p => p.type === pattern)
  const e = EYES.find(e => e.type === eyes)
  return (
    <div className="egg-visual" style={{ width: size, height: size * 1.2 }}>
      <svg viewBox="0 0 100 120" width={size} height={size * 1.2}>
        <ellipse cx="50" cy="65" rx="38" ry="48" fill={color} stroke="#333" strokeWidth="2.5" />
        <ellipse cx="50" cy="65" rx="38" ry="48" fill="rgba(255,255,255,0.15)" />
        <text x="50" y="55" textAnchor="middle" fontSize="20">{e?.display || '◉ ◉'}</text>
        <text x="50" y="90" textAnchor="middle" fontSize="22">{p?.emoji || '⭐'}</text>
      </svg>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'select' | 'reveal' | 'born'>('select')
  const [selected, setSelected] = useState<string | null>(null)
  const [eggConfig, setEggConfig] = useState({ pattern: '', color: '', eyes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      supabase.from('members').select('egg_config').eq('user_id', session.user.id).limit(1)
        .then(({ data }) => {
          if (data?.[0]?.egg_config?.pattern) router.push('/crew-select')
        })
    })
  }, [router])

  function handleSelect(pattern: string) {
    setSelected(pattern)
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const eyes = EYES[Math.floor(Math.random() * EYES.length)].type
    setEggConfig({ pattern, color, eyes })

    // 페이드 후 reveal
    setTimeout(() => setPhase('reveal'), 800)
    setTimeout(() => setPhase('born'), 2500)
  }

  async function handleConfirm() {
    if (!userId) return
    setSaving(true)
    const eggType = ['star', 'cloud', 'moon', 'sun'].includes(eggConfig.pattern) ? eggConfig.pattern : 'star'
    await supabase.from('members').update({
      egg_type: eggType,
      egg_config: eggConfig,
    }).eq('user_id', userId)
    router.push('/crew-select')
  }

  return (
    <div className="ob-page">
      <header className="ob-header">
        <img src="/peo-logo-center.png" alt="PEO" className="ob-logo" />
      </header>

      <div className="ob-body">
        {phase === 'select' && (
          <>
            <h1 className="ob-title">당신은 어떤 유형의 러너입니까?</h1>
            <p className="ob-subtitle">속성을 선택하세요</p>

            <div className="ob-grid">
              {PATTERNS.map(p => (
                <button
                  key={p.type}
                  className={`ob-attr ${selected === p.type ? 'ob-attr-selected' : ''} ${selected && selected !== p.type ? 'ob-attr-fade' : ''}`}
                  onClick={() => !selected && handleSelect(p.type)}
                  disabled={!!selected}
                >
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
              <EggVisual pattern={eggConfig.pattern} color={eggConfig.color} eyes={eggConfig.eyes} size={140} />
            </div>
            <p className="ob-reveal-text">알이 만들어지고 있어요...</p>
          </div>
        )}

        {phase === 'born' && (
          <div className="ob-born">
            <div className="ob-born-egg">
              <EggVisual pattern={eggConfig.pattern} color={eggConfig.color} eyes={eggConfig.eyes} size={160} />
            </div>
            <h2 className="ob-born-title">알이 탄생했어요!</h2>
            <p className="ob-born-desc">
              {PATTERNS.find(p => p.type === eggConfig.pattern)?.emoji}{' '}
              {PATTERNS.find(p => p.type === eggConfig.pattern)?.name} 속성 ·{' '}
              {EYES.find(e => e.type === eggConfig.eyes)?.display} 눈
            </p>
            <button className="ob-confirm" onClick={handleConfirm} disabled={saving}>
              {saving ? '저장 중...' : '시작하기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
