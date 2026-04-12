'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function validatePassword(pw: string) {
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 해요'
  if (!/[a-z]/.test(pw)) return '소문자 영문을 포함해야 해요'
  if (!/[0-9]/.test(pw)) return '숫자를 포함해야 해요'
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) return '특수문자를 포함해야 해요'
  return null
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState(false)

  useEffect(() => {
    // Supabase will auto-detect the recovery token from the URL hash
    // and establish a session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if already in a session (e.g., page refresh after token consumed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      } else {
        // Give a moment for the auth state change to fire
        setTimeout(() => {
          setSessionError(true)
        }, 3000)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const pwMatch = password.length > 0 && passwordConfirm.length > 0 && password === passwordConfirm

  async function handleReset() {
    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== passwordConfirm) { setError('비밀번호가 일치하지 않아요'); return }

    setLoading(true)
    setError('')

    const { error: updateErr } = await supabase.auth.updateUser({ password })

    if (updateErr) {
      if (updateErr.message.includes('expired') || updateErr.message.includes('invalid')) {
        setError('링크가 만료되었습니다. 비밀번호 찾기를 다시 진행해주세요.')
      } else {
        setError(updateErr.message)
      }
    } else {
      setSuccess(true)
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
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>비밀번호 재설정</h2>

        {success ? (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <div style={{
              padding: 24,
              background: '#f8f8f8',
              borderRadius: 12,
              marginBottom: 24,
            }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</p>
              <p style={{ fontSize: 16, fontWeight: 600 }}>
                비밀번호가 변경되었습니다
              </p>
              <p style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                새 비밀번호로 로그인해주세요.
              </p>
            </div>
            <button
              className="login-btn-main"
              onClick={() => router.push('/login')}
            >
              로그인하기
            </button>
          </div>
        ) : !sessionReady && !sessionError ? (
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <p style={{ fontSize: 14, color: '#888' }}>인증 확인 중...</p>
          </div>
        ) : sessionError && !sessionReady ? (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <div style={{
              padding: 24,
              background: '#fff5f5',
              borderRadius: 12,
              marginBottom: 24,
            }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#e74c3c' }}>
                링크가 만료되었거나 유효하지 않습니다
              </p>
              <p style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                비밀번호 찾기를 다시 진행해주세요.
              </p>
            </div>
            <button
              className="login-btn-main"
              onClick={() => router.push('/forgot-password')}
            >
              비밀번호 찾기로 이동
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>
              새로운 비밀번호를 입력해주세요.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="pw-row">
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="새 비밀번호 (8자 이상, 소문자/숫자/특수문자)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button className="pw-eye" type="button" onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <div className="pw-row">
                <input
                  className="auth-input"
                  type={showPwConfirm ? 'text' : 'password'}
                  placeholder="비밀번호 확인"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                />
                <button className="pw-eye" type="button" onClick={() => setShowPwConfirm(v => !v)}>
                  {showPwConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
                {pwMatch && <span className="pw-match-check">&#10003;</span>}
              </div>

              <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                8자 이상, 소문자 영문, 숫자, 특수문자 포함
              </p>

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
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
