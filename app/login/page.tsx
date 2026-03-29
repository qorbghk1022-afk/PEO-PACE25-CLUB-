'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const SYMBOL_WHITE = '/peo-real-new-white.png'
const SYMBOL_BLACK = '/peo-real-new-black.png'

export default function LoginPage() {
  const router = useRouter()
  // 0: 스플래시, 1: 전환중, 2: 로그인
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1600)
    const t2 = setTimeout(() => setPhase(2), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const isLogin = phase >= 1

  return (
    <div className="login-wrap">
      {/* 배경: 스플래시=검정, 로그인=흰색 */}
      <div className={`login-bg-layer ${isLogin ? 'login-bg-visible' : ''}`} />

      {/* 로고 영역 — 같은 위치/크기, 크로스페이드 */}
      <div className="login-logo-fixed">
        <div className="symbol-stack">
          <img src={SYMBOL_WHITE} alt="PEO" className={`login-symbol ${isLogin ? 'sym-hidden' : 'sym-visible'}`} />
          <img src={SYMBOL_BLACK} alt="PEO" className={`login-symbol ${isLogin ? 'sym-visible' : 'sym-hidden'}`} />
        </div>
      </div>

      {/* 하단 버튼: 로그인 단계에서만 등장 */}
      <div className={`login-bottom ${phase === 2 ? 'bottom-visible' : 'bottom-hidden'}`}>
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
