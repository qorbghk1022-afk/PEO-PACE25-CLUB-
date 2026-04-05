'use client'

import { useState } from 'react'

const BALL_COLORS = ['#A51C30', '#d4365c', '#e8d5c0', '#333', '#f5efe6', '#8B0000', '#c9a080', '#555', '#D92610', '#f0e4d6']

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

  const balls = Array.from({ length: totalBalls }).map((_, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = 78 + col * 16 - (row % 2 === 1 ? 8 : 0)
    const y = 132 - row * 15
    return { x, y, color: BALL_COLORS[i % BALL_COLORS.length], delay: (i * 0.06) }
  })

  return (
    <div className="gacha-wrap">
      <svg
        viewBox="0 0 200 230"
        className={`gacha-svg ${isShaking ? 'gacha-shake' : ''}`}
        onClick={handleClick}
      >
        <defs>
          {/* 유리 그라데이션 */}
          <radialGradient id="glassShine" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.05" />
          </radialGradient>
          {/* 유리 테두리 그라데이션 */}
          <linearGradient id="glassBorder" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#aaa" />
            <stop offset="50%" stopColor="#666" />
            <stop offset="100%" stopColor="#444" />
          </linearGradient>
          {/* 몸통 입체 */}
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B0000" />
            <stop offset="30%" stopColor="#A51C30" />
            <stop offset="70%" stopColor="#A51C30" />
            <stop offset="100%" stopColor="#6B0000" />
          </linearGradient>
          {/* 캡 입체 */}
          <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c42040" />
            <stop offset="100%" stopColor="#8B0000" />
          </linearGradient>
          {/* 그림자 */}
          <filter id="shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.2"/>
          </filter>
        </defs>

        {/* 전체 그림자 */}
        <ellipse cx="100" cy="226" rx="50" ry="4" fill="rgba(0,0,0,0.15)" />

        {/* 꼭대기 캡 - 입체 */}
        <ellipse cx="100" cy="16" rx="14" ry="9" fill="url(#capGrad)" stroke="#333" strokeWidth="2" />
        <ellipse cx="100" cy="14" rx="10" ry="5" fill="rgba(255,255,255,0.15)" />

        {/* 유리 구슬 - 투명 + 입체 */}
        <circle cx="100" cy="88" r="68" fill="rgba(180,200,220,0.06)" stroke="url(#glassBorder)" strokeWidth="3" />
        {/* 내부 어두운 원 (깊이감) */}
        <circle cx="100" cy="90" r="64" fill="rgba(0,0,0,0.03)" />
        {/* 유리 반사 - 크고 은은하게 */}
        <ellipse cx="76" cy="56" rx="30" ry="20" fill="rgba(255,255,255,0.08)" />
        <ellipse cx="72" cy="50" rx="14" ry="8" fill="rgba(255,255,255,0.12)" />
        {/* 하단 반사 */}
        <ellipse cx="120" cy="130" rx="20" ry="8" fill="rgba(255,255,255,0.03)" />

        {/* 알 모양 볼들 */}
        {balls.map((b, i) => (
          <g key={i} filter="url(#shadow)">
            <ellipse
              cx={b.x} cy={b.y} rx="6" ry="8"
              fill={b.color}
              stroke="rgba(0,0,0,0.15)"
              strokeWidth="0.5"
              className={isShaking ? 'gacha-ball-bounce' : ''}
              style={{ animationDelay: `${b.delay}s` }}
            />
            {/* 볼 하이라이트 */}
            <ellipse cx={b.x - 1.5} cy={b.y - 3} rx="2" ry="2.5" fill="rgba(255,255,255,0.35)" />
          </g>
        ))}

        {/* 밴드 - 입체 */}
        <rect x="46" y="154" width="108" height="14" rx="3" fill="url(#bodyGrad)" stroke="#333" strokeWidth="2" />
        <rect x="46" y="154" width="108" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <text x="100" y="165" textAnchor="middle" fontSize="8" fill="#f5efe6" fontWeight="700" fontFamily="'RoundedFixedsys', monospace" opacity="0.8">PEO</text>

        {/* 손잡이 - 입체 */}
        <circle cx="146" cy="161" r="10" fill="#e8d5c0" stroke="#333" strokeWidth="2" />
        <circle cx="146" cy="161" r="6" fill="#f5efe6" stroke="#555" strokeWidth="1" />
        <circle cx="146" cy="161" r="3" fill="#A51C30" />
        <ellipse cx="144" cy="159" rx="2" ry="1.5" fill="rgba(255,255,255,0.3)" />

        {/* 몸통 - 입체 */}
        <path d="M58 168 L58 200 Q58 210 70 210 L130 210 Q142 210 142 200 L142 168" fill="url(#bodyGrad)" stroke="#333" strokeWidth="2" />
        {/* 몸통 하이라이트 */}
        <path d="M60 168 L60 200 Q60 208 70 208" fill="rgba(255,255,255,0.08)" />

        {/* 티켓 카운터 */}
        <rect x="80" y="180" width="40" height="16" rx="4" fill="#600" stroke="#333" strokeWidth="1" />
        <rect x="80" y="180" width="40" height="5" rx="2" fill="rgba(255,255,255,0.08)" />
        <text x="100" y="192" textAnchor="middle" fontSize="10" fill="#f5efe6" fontWeight="700" fontFamily="'RoundedFixedsys', monospace">x {ticketCount}</text>

        {/* 배출구 */}
        <rect x="84" y="210" width="32" height="10" rx="5" fill="#0a0a0a" stroke="#333" strokeWidth="1.5" />
        <rect x="90" y="212" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.05)" />

        {/* 다리 - 입체 */}
        <rect x="64" y="218" width="16" height="8" rx="2" fill="url(#bodyGrad)" stroke="#333" strokeWidth="1.5" />
        <rect x="120" y="218" width="16" height="8" rx="2" fill="url(#bodyGrad)" stroke="#333" strokeWidth="1.5" />
      </svg>

      <div className="gacha-label">
        {disabled ? '분기 종료 후 활성화' : '터치하여 추첨하기'}
      </div>
    </div>
  )
}
