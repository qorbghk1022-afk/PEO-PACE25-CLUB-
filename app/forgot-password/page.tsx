'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [tempPw, setTempPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleReset() {
    if (!email.trim()) { setError('이메일을 입력해주세요'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() })
    })
    const data = await res.json()
    if (res.ok) {
      setTempPw(data.tempPassword)
    } else {
      setError(data.error || '오류가 발생했습니다')
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fff' }}>
      <header className="cs-header">
        <button className="cs-back" onClick={() => router.push('/login')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <img src="/peo-logo-black.png" alt="PEO" className="cs-header-logo" />
        <div className="cs-header-spacer" />
      </header>

      <div style={{ padding: '32px 24px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>비밀번호 찾기</h1>

        {tempPw ? (
          <div>
            <p style={{ fontSize: 14, color: '#333', marginBottom: 16, lineHeight: 1.6 }}>
              임시 비밀번호가 발급되었습니다.<br/>
              이 비밀번호로 로그인 후 <strong>내 정보</strong>에서 비밀번호를 변경해주세요.
            </p>
            <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>임시 비밀번호</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#A51C30', letterSpacing: 2 }}>{tempPw}</p>
            </div>
            <button className="login-btn-main" onClick={() => router.push('/login')} style={{ width: '100%' }}>
              로그인하기
            </button>
          </div>
        ) : (
          <div>
            <input
              className="auth-input"
              type="email"
              placeholder="가입한 이메일"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
            {error && <p style={{ fontSize: 13, color: '#A51C30', marginBottom: 12 }}>{error}</p>}
            <button className="login-btn-main" onClick={handleReset} disabled={loading} style={{ width: '100%' }}>
              {loading ? '발급 중...' : '임시 비밀번호 발급'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
