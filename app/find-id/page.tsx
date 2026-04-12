'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FindIdPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [realname, setRealname] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  async function handleFindId() {
    if (!nickname.trim() || !realname.trim()) {
      setError('닉네임과 실명을 모두 입력해주세요')
      setResult('')
      return
    }

    setLoading(true)
    setError('')
    setResult('')

    try {
      const res = await fetch('/api/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), realname: realname.trim() }),
      })

      const data = await res.json()

      if (res.ok && data.email) {
        setResult(data.email)
      } else {
        setError(data.error || '일치하는 계정을 찾을 수 없습니다')
      }
    } catch {
      setError('서버 오류가 발생했습니다')
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
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>아이디 찾기</h2>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>
          가입 시 사용한 닉네임과 실명을 입력해주세요.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="auth-input"
            placeholder="닉네임"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
          />
          <input
            className="auth-input"
            placeholder="실명"
            value={realname}
            onChange={e => setRealname(e.target.value)}
          />

          <button
            className="login-btn-main"
            onClick={handleFindId}
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? '조회 중...' : '아이디 찾기'}
          </button>
        </div>

        {result && (
          <div style={{
            marginTop: 24,
            padding: 20,
            background: '#f8f8f8',
            borderRadius: 12,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>가입된 이메일</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#A51C30' }}>{result}</p>
          </div>
        )}

        {error && (
          <p style={{
            marginTop: 16,
            fontSize: 14,
            color: '#e74c3c',
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        <p style={{ marginTop: 16, fontSize: 12, color: '#999', textAlign: 'center' }}>
          찾을 수 없는 경우 문의: a5214275@naver.com
        </p>

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
