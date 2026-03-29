'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

type View = 'splash' | 'main' | 'login' | 'signup'

function validatePassword(pw: string) {
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 해요'
  if (!/[a-z]/.test(pw)) return '소문자 영문을 포함해야 해요'
  if (!/[0-9]/.test(pw)) return '숫자를 포함해야 해요'
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) return '특수문자를 포함해야 해요'
  return null
}

export default function LoginPage() {
  const router = useRouter()
  const [phase, setPhase] = useState(0)
  const [view, setView] = useState<View>('splash')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [nickname, setNickname] = useState('')
  const [nicknameChecked, setNicknameChecked] = useState(false)
  const [nicknameMsg, setNicknameMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/')
    })
    const t1 = setTimeout(() => setPhase(1), 1600)
    const t2 = setTimeout(() => { setPhase(2); setView('main') }, 2200)
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

  async function checkNickname() {
    if (!nickname.trim()) { setNicknameMsg('닉네임을 입력해주세요'); return }
    const { data } = await supabase
      .from('members')
      .select('nickname, user_id')
      .eq('nickname', nickname.trim())
      .maybeSingle()
    if (!data) {
      setNicknameMsg('✓ 사용 가능한 닉네임이에요 (신규 가입)')
      setNicknameChecked(true)
    } else if (data.user_id) {
      setNicknameMsg('✗ 이미 가입된 닉네임이에요')
      setNicknameChecked(false)
    } else {
      setNicknameMsg('✓ 기존 크루원으로 확인됐어요')
      setNicknameChecked(true)
    }
  }

  async function handleSignup() {
    if (!nicknameChecked) { setError('닉네임 중복확인을 해주세요'); return }
    if (!email || !password || !passwordConfirm) { setError('모든 항목을 입력해주세요'); return }
    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== passwordConfirm) { setError('비밀번호가 일치하지 않아요'); return }
    setLoading(true); setError('')

    const { data: existing } = await supabase
      .from('members')
      .select('nickname, user_id')
      .eq('nickname', nickname.trim())
      .maybeSingle()

    const { data, error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError) { setError(signupError.message); setLoading(false); return }

    const userId = data.user?.id
    if (!userId) { setError('계정 생성에 실패했어요'); setLoading(false); return }

    if (existing) {
      await supabase.from('members').update({ user_id: userId }).eq('nickname', nickname.trim())
    } else {
      await supabase.from('members').insert({ nickname: nickname.trim(), user_id: userId, egg_type: 'star' })
    }

    router.push('/')
    setLoading(false)
  }

  const isLogin = phase >= 1
  const showForm = view === 'login' || view === 'signup'

  function goBack() {
    setView('main'); setError('')
    setNickname(''); setNicknameChecked(false); setNicknameMsg('')
    setEmail(''); setPassword(''); setPasswordConfirm('')
  }

  return (
    <div className="login-wrap">
      <div className={`login-bg-layer ${isLogin ? 'login-bg-visible' : ''}`} />

      {/* 다크 오버레이 */}
      <div className={`login-overlay ${showForm ? 'overlay-visible' : ''}`} />

      {/* 좌상단 뒤로가기 화살표 */}
      <button
        className={`auth-back-arrow ${showForm ? 'arrow-visible' : 'arrow-hidden'}`}
        onClick={goBack}
      >←</button>

      {/* 로고 */}
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

      {/* 메인: 로그인 | 회원가입 버튼 */}
      <div className={`login-bottom ${view === 'main' ? 'bottom-visible' : 'bottom-hidden'}`}>
        <div className="login-btns">
          <button className="login-btn-main" onClick={() => setView('login')}>로그인</button>
          <button className="login-btn-sub" onClick={() => setView('signup')}>회원가입</button>
        </div>
      </div>

      {/* 로그인 폼 */}
      <div className={`login-bottom form-panel ${view === 'login' ? 'bottom-visible' : 'bottom-hidden'}`}>
        <p className="auth-title">로그인</p>
        <div className="auth-form">
          <input className="auth-input" type="email" placeholder="이메일"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className="auth-input" type="password" placeholder="비밀번호"
            value={password} onChange={e => setPassword(e.target.value)} />
          {error && <p className="auth-error">{error}</p>}
          <button className="login-btn-main" onClick={handleLogin} disabled={loading}>
            {loading ? '...' : '로그인'}
          </button>
        </div>
      </div>

      {/* 회원가입 폼 */}
      <div className={`login-bottom form-panel ${view === 'signup' ? 'bottom-visible' : 'bottom-hidden'}`}>
        <p className="auth-title">회원가입</p>
        <div className="auth-form">
          <div className="nickname-row">
            <input className="auth-input nickname-input" placeholder="닉네임 (기존 크루원은 본인 닉네임)"
              value={nickname} onChange={e => { setNickname(e.target.value); setNicknameChecked(false); setNicknameMsg('') }} />
            <button className="nickname-check-btn" onClick={checkNickname} type="button">중복확인</button>
          </div>
          {nicknameMsg && (
            <p className={`nickname-msg ${nicknameChecked ? 'nickname-ok' : 'nickname-err'}`}>{nicknameMsg}</p>
          )}
          <input className="auth-input" type="email" placeholder="이메일"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className="auth-input" type="password" placeholder="비밀번호 (8자↑, 영문소문자·숫자·특수문자 포함)"
            value={password} onChange={e => setPassword(e.target.value)} />
          <input className="auth-input" type="password" placeholder="비밀번호 확인"
            value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
          {error && <p className="auth-error">{error}</p>}
          <button className="login-btn-main" onClick={handleSignup} disabled={loading}>
            {loading ? '...' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
