'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    if (!email.trim()) {
      setError('이메일을 입력해주세요')
      return
    }

    setLoading(true)
    setError('')

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://www.pace25.com/reset-password',
    })

    if (resetErr) {
      setError('이메일 발송에 실패했습니다. 올바른 이메일인지 확인해주세요.')
    } else {
      setSent(true)
    }

    setLoading(false)
  }

  return (
    <div className="cs-page">
      <header className="cs-header">
        <button className="cs-back" onClick={() => router.push('/login')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <img src="/peo-egglog-black.png" alt="PEO" className="cs-header-logo" />
        <div className="cs-header-spacer" />
      </header>

      <div style={{ padding: '40px 24px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>비밀번호 찾기</h2>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>
          가입한 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
        </p>

        {!sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="auth-input"
              type="email"
              placeholder="가입한 이메일"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />

            {error && (
              <p style={{ fontSize: 14, color: '#e74c3c', textAlign: 'center' }}>
                {error}
              </p>
            )}

            <button
              className="login-btn-main"
              onClick={handleReset}
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? '발송 중...' : '비밀번호 재설정 링크 발송'}
            </button>
          </div>
        ) : (
          <div style={{
            padding: 24,
            background: '#f8f8f8',
            borderRadius: 12,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>&#9993;</p>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              이메일을 확인해주세요
            </p>
            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
              입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다.
              <br />메일함을 확인해주세요.
            </p>
          </div>
        )}

        <button
          className="login-btn-main"
          onClick={() => router.push('/login')}
          style={{
            marginTop: 32,
            background: '#fff',
            color: '#111',
            border: '1px solid #ddd',
          }}
        >
          로그인으로 돌아가기
        </button>
      </div>
    </div>
  )
}
