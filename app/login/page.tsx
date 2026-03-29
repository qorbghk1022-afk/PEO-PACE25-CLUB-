'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)

  function handleSelect(type: string) {
    setSelected(type)
    setTimeout(() => router.push('/'), 300)
  }

  return (
    <div className="login-screen">
      {/* PEO 마크 배경 */}
      <div className="login-bg" />

      {/* 오버레이 */}
      <div className="login-overlay" />

      {/* 콘텐츠 */}
      <div className="login-content">
        <div className="login-logo">
          <img src="/pace25-banner.png" alt="PACE25" className="login-banner" />
        </div>

        <p className="login-subtitle">러닝 크루 챌린지 플랫폼</p>

        <div className="login-circles">
          <button
            className={`circle-btn${selected === 'login' ? ' selected' : ''}`}
            onClick={() => handleSelect('login')}
          >
            <span className="circle-icon">🔑</span>
            <span className="circle-label">로그인</span>
          </button>

          <button
            className={`circle-btn${selected === 'signup' ? ' selected' : ''}`}
            onClick={() => handleSelect('signup')}
          >
            <span className="circle-icon">✦</span>
            <span className="circle-label">회원가입</span>
          </button>
        </div>
      </div>
    </div>
  )
}
