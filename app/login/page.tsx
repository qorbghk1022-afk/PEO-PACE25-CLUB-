'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [showSplash, setShowSplash] = useState(true)
  const [splashFading, setSplashFading] = useState(false)
  const [loginVisible, setLoginVisible] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setSplashFading(true), 1600)
    const t2 = setTimeout(() => {
      setShowSplash(false)
      setLoginVisible(true)
    }, 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div className="login-wrap">
      {/* 스플래시 */}
      {showSplash && (
        <div className={`splash-screen ${splashFading ? 'splash-fade-out' : 'splash-fade-in'}`}>
          <img src="/%EC%8B%AC%EB%B3%BC%EB%A1%9C%EA%B3%A0(%EB%B0%B0%EA%B2%BD%EC%A0%9C%EA%B1%B0).png" alt="PEO" className="splash-logo" />
        </div>
      )}

      {/* 로그인 화면 */}
      {!showSplash && (
        <div className={`login-screen-v2 ${loginVisible ? 'login-fade-in' : ''}`}>
          {/* 상단 로고 영역 */}
          <div className="login-logo-area">
            <img src="/%EC%8B%AC%EB%B3%BC%EB%A1%9C%EA%B3%A0(%EB%B0%B0%EA%B2%BD%EC%A0%9C%EA%B1%B0).png" alt="PEO" className="login-center-logo" />
            <img src="/%EB%AC%B8%EC%9E%90%EB%A1%9C%EA%B3%A0(%EB%B0%B0%EA%B2%BD%EC%A0%9C%EA%B1%B0).png" alt="PEO" className="login-text-logo" />
          </div>

          {/* 하단 버튼 영역 */}
          <div className="login-bottom">
            <p className="login-start-label">시작하기</p>
            <div className="login-btns">
              <button
                className="login-btn-main"
                onClick={() => router.push('/')}
              >
                로그인
              </button>
              <button
                className="login-btn-sub"
                onClick={() => router.push('/')}
              >
                회원가입
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
