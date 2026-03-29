'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
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

      {/* 로고 영역 */}
      <div className="login-logo-fixed">
        <div className="egg-stack">
          {/* 스플래시: 흰 알 + 검정 로고 */}
          <div className={`egg-scene ${isLogin ? 'sym-hidden' : 'sym-visible'}`}>
            <div className="egg-shape egg-white" />
            <img src="/peo-real-new-black.png" alt="PEO" className="logo-inside" />
          </div>
          {/* 로그인: 빨간 알 + 흰 로고 */}
          <div className={`egg-scene ${isLogin ? 'sym-visible' : 'sym-hidden'}`}>
            <div className="egg-shape egg-red" />
            <img src="/peo-real-new-white.png" alt="PEO" className="logo-inside" />
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className={`login-bottom ${phase === 2 ? 'bottom-visible' : 'bottom-hidden'}`}>
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
