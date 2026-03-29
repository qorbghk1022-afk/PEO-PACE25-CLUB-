'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const SYMBOL = '/peo-symbol(new).png'
const TEXT_LOGO = '/peo-text.png'

export default function LoginPage() {
  const router = useRouter()
  // 0: 스플래시, 1: 전환중, 2: 로그인
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1600) // 전환 시작
    const t2 = setTimeout(() => setPhase(2), 2200) // 로그인 완전 표시
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const isSplash = phase === 0
  const isLogin = phase === 2

  return (
    <div className="login-wrap">
      {/* 배경: 스플래시=흰색, 로그인=그라데이션 */}
      <div className={`login-bg-layer ${isLogin ? 'login-bg-visible' : ''}`} />

      {/* 로고 영역 — 항상 같은 위치 */}
      <div className={`login-logo-fixed ${isLogin ? 'logo-small' : 'logo-large'}`}>
        <img src={SYMBOL} alt="PEO" className="login-symbol" />
        <img
          src={TEXT_LOGO}
          alt="PEO"
          className={`login-text-logo ${isLogin ? 'text-visible' : 'text-hidden'}`}
        />
      </div>

      {/* 하단 버튼: 로그인 단계에서만 등장 */}
      <div className={`login-bottom ${isLogin ? 'bottom-visible' : 'bottom-hidden'}`}>
        <p className="login-start-label">시작하기</p>
        <div className="login-btns">
          <button className="login-btn-main" onClick={() => router.push('/')}>
            로그인
          </button>
          <button className="login-btn-sub" onClick={() => router.push('/')}>
            회원가입
          </button>
        </div>
      </div>
    </div>
  )
}
