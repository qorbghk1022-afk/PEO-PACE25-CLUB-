'use client'

import { useState } from 'react'

const BALL_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A8E6CF', '#FFB347', '#C3B1E1', '#F8B500', '#87CEEB', '#FF9AA2', '#B5EAD7']

interface GachaMachineProps {
  ticketCount: number
  totalBalls: number
  disabled?: boolean
  onDraw?: () => void
}

export default function GachaMachine({ ticketCount, totalBalls, disabled, onDraw }: GachaMachineProps) {
  const [isShaking, setIsShaking] = useState(false)

  function handleClick() {
    if (disabled) return
    setIsShaking(true)
    setTimeout(() => {
      setIsShaking(false)
      onDraw?.()
    }, 2000)
  }

  // 볼 위치 생성 (구슬 안에 랜덤 배치)
  const balls = Array.from({ length: totalBalls }).map((_, i) => {
    const angle = (i / totalBalls) * 360 + (i * 37) % 60
    const r = 15 + ((i * 13) % 30)
    const x = 50 + r * Math.cos((angle * Math.PI) / 180)
    const y = 48 + r * Math.sin((angle * Math.PI) / 180)
    return { x, y, color: BALL_COLORS[i % BALL_COLORS.length], delay: (i * 0.07) }
  })

  return (
    <div className="gacha-wrap">
      <svg
        viewBox="0 0 200 280"
        className={`gacha-svg ${isShaking ? 'gacha-shake' : ''}`}
        onClick={handleClick}
      >
        {/* 상단 캡 */}
        <rect x="85" y="8" width="30" height="12" rx="6" fill="#FF6B00" stroke="#333" strokeWidth="2" />
        <rect x="80" y="16" width="40" height="8" rx="4" fill="#FF8C00" stroke="#333" strokeWidth="2" />

        {/* 유리 구슬 */}
        <circle cx="100" cy="100" r="72" fill="#1a1a2e" stroke="#333" strokeWidth="3" />
        <circle cx="100" cy="100" r="70" fill="url(#glassGrad)" opacity="0.3" />

        {/* 볼들 */}
        {balls.map((b, i) => (
          <g key={i}>
            <circle
              cx={b.x * 1.4 + 30}
              cy={b.y * 1.2 + 20}
              r="8"
              fill={b.color}
              stroke="rgba(0,0,0,0.2)"
              strokeWidth="1"
              className={isShaking ? 'gacha-ball-bounce' : ''}
              style={{ animationDelay: `${b.delay}s` }}
            />
            <circle
              cx={b.x * 1.4 + 27}
              cy={b.y * 1.2 + 17}
              r="2.5"
              fill="rgba(255,255,255,0.4)"
            />
          </g>
        ))}

        {/* 유리 반사 */}
        <ellipse cx="78" cy="72" rx="25" ry="18" fill="rgba(255,255,255,0.08)" />

        {/* 티켓 카운터 (상단 캡) */}
        <circle cx="100" cy="14" r="10" fill="#FF6B00" stroke="#333" strokeWidth="2" />
        <text x="100" y="18" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700" fontFamily="'RoundedFixedsys', monospace">{ticketCount}</text>

        {/* 받침대 */}
        <rect x="55" y="170" width="90" height="14" rx="4" fill="#6B2FA0" stroke="#333" strokeWidth="2" />

        {/* 손잡이 */}
        <circle cx="100" cy="184" r="14" fill="#f5efe6" stroke="#333" strokeWidth="3" />
        <line x1="93" y1="184" x2="107" y2="184" stroke="#333" strokeWidth="2" />
        <line x1="100" y1="177" x2="100" y2="191" stroke="#333" strokeWidth="2" />

        {/* 몸통 */}
        <path d="M65 184 L65 230 Q65 245 80 245 L120 245 Q135 245 135 230 L135 184" fill="#6B2FA0" stroke="#333" strokeWidth="2" />

        {/* 배출구 */}
        <rect x="80" y="245" width="40" height="16" rx="8" fill="#111" stroke="#333" strokeWidth="2" />

        {/* 다리 */}
        <rect x="70" y="258" width="15" height="12" rx="3" fill="#6B2FA0" stroke="#333" strokeWidth="2" />
        <rect x="115" y="258" width="15" height="12" rx="3" fill="#6B2FA0" stroke="#333" strokeWidth="2" />

        <defs>
          <radialGradient id="glassGrad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.1" />
          </radialGradient>
        </defs>
      </svg>

      {!disabled && (
        <div className="gacha-label">터치하여 추첨하기</div>
      )}
    </div>
  )
}
