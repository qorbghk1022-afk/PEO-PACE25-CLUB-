'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

type AuthTab = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [phase, setPhase] = useState(0)
  const [tab, setTab] = useState<AuthTab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/')
    })
    const t1 = setTimeout(() => setPhase(1), 1600)
    const t2 = setTimeout(() => setPhase(2), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  async function handleLogin() {
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('이메일 또는 비밀번호가 틀렸어요')
    else router.push('/')
    setLoading(false)
  }

  async function handleSignup() {
    if (!nickname || !email || !password) { setError('모든 항목을 입력해주세요'); return }
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 해요'); return }
    setLoading(true); setError('')

    // 닉네임 기존회원 확인
    const { data: existing } = await supabase
      .from('members')
      .select('nickname, user_id')
      .eq('nickname', nickname)
      .maybeSingle()

    if (existing?.user_id) {
      setError('이미 가입된 닉네임이에요')
      setLoading(false)
      return
    }

    const { data, error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError) { setError(signupError.message); setLoading(false); return }

    const userId = data.user?.id
    if (!userId) { setError('계정 생성에 실패했어요'); setLoading(false); return }

    if (existing) {
      // 기존 크루 → user_id 연결
      await supabase.from('members').update({ user_id: userId }).eq('nickname', nickname)
    } else {
      // 신규 회원 → 새 row 생성
      await supabase.from('members').insert({ nickname, user_id: userId, egg_type: 'star' })
    }

    router.push('/')
    setLoading(false)
  }

  const isLogin = phase >= 1

  return (
    <div className="login-wrap">
      <div className={`login-bg-layer ${isLogin ? 'login-bg-visible' : ''}`} />

      <div className="login-logo-fixed">
        <div className="egg-stack">
          <div className={`egg-scene ${isLogin ? 'sym-hidden' : 'sym-visible'}`}>
            <img src="/peo-egglog-white.png" alt="PEO" className="egg-img" />
          </div>
          <div className={`egg-scene ${isLogin ? 'sym-visible' : 'sym-hidden'}`}>
            <img src="/peo-egglog-black.png" alt="PEO" className="egg-img" />
          </div>
        </div>
      </div>

      <div className={`login-bottom ${phase === 2 ? 'bottom-visible' : 'bottom-hidden'}`}>
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError('') }}
          >로그인</button>
          <button
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError('') }}
          >회원가입</button>
        </div>

        <div className="auth-form">
          {tab === 'signup' && (
            <input
              className="auth-input"
              placeholder="닉네임 (기존 크루원은 본인 닉네임)"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
          )}
          <input
            className="auth-input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="auth-input"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <p className="auth-error">{error}</p>}
          <button
            className="login-btn-main"
            onClick={tab === 'login' ? handleLogin : handleSignup}
            disabled={loading}
          >
            {loading ? '...' : tab === 'login' ? '로그인' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
