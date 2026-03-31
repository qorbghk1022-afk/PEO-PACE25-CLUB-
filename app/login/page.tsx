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

type View = 'splash' | 'main' | 'login' | 'signup'

declare global {
  interface Window {
    daum: {
      Postcode: new (options: { oncomplete: (data: { address: string; zonecode: string }) => void }) => { open: () => void }
    }
  }
}

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

  // 로그인 폼
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showLoginPw, setShowLoginPw] = useState(false)

  // 회원가입 폼
  const [nickname, setNickname] = useState('')
  const [nicknameChecked, setNicknameChecked] = useState(false)
  const [nicknameMsg, setNicknameMsg] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpMsg, setOtpMsg] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showSignupPw, setShowSignupPw] = useState(false)
  const [showSignupPwConfirm, setShowSignupPwConfirm] = useState(false)
  const [realName, setRealName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [addressDetail, setAddressDetail] = useState('')
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [stravaAgreed, setStravaAgreed] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/')
    })
    const t1 = setTimeout(() => setPhase(1), 1600)
    const t2 = setTimeout(() => { setPhase(2); setView('main') }, 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  function openAddressSearch() {
    if (!window.daum) return
    new window.daum.Postcode({
      oncomplete(data) {
        setAddress(data.address)
        setAddressDetail('')
      },
    }).open()
  }

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

  // 이메일로 인증코드 발송
  async function sendOtp() {
    if (!signupEmail) { setOtpMsg('이메일을 입력해주세요'); return }
    setOtpLoading(true); setOtpMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email: signupEmail,
      options: { shouldCreateUser: true },
    })
    if (error) {
      setOtpMsg(`발송 실패: ${error.message}`)
    } else {
      setOtpSent(true)
      setOtpMsg('인증코드를 이메일로 발송했어요')
    }
    setOtpLoading(false)
  }

  // 인증코드 확인
  async function verifyOtp() {
    if (!otpCode || otpCode.length < 6) { setOtpMsg('인증코드를 입력해주세요'); return }
    setOtpLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: signupEmail,
      token: otpCode,
      type: 'email',
    })
    if (error) {
      setOtpMsg('✗ 인증코드가 틀렸어요')
      setOtpLoading(false)
      return
    }
    setEmailVerified(true)
    setOtpMsg('✓ 이메일 인증 완료')
    setOtpLoading(false)
  }

  async function handleSignup() {
    if (!nicknameChecked) { setError('닉네임 중복확인을 해주세요'); return }
    if (!emailVerified) { setError('이메일 인증을 완료해주세요'); return }
    if (!signupPassword || !passwordConfirm) { setError('비밀번호를 입력해주세요'); return }
    if (!realName.trim()) { setError('실명을 입력해주세요'); return }
    if (!phone.trim()) { setError('전화번호를 입력해주세요'); return }
    if (!address.trim()) { setError('주소를 검색해주세요'); return }
    if (!privacyAgreed) { setError('개인정보 수집·이용에 동의해주세요'); return }
    if (!stravaAgreed) { setError('스트라바 데이터 연동에 동의해주세요'); return }
    const pwErr = validatePassword(signupPassword)
    if (pwErr) { setError(pwErr); return }
    if (signupPassword !== passwordConfirm) { setError('비밀번호가 일치하지 않아요'); return }

    setLoading(true); setError('')

    // OTP로 이미 로그인된 상태 → 비밀번호 설정
    const { data: { user }, error: updateErr } = await supabase.auth.updateUser({ password: signupPassword })
    if (updateErr) { setError(updateErr.message); setLoading(false); return }

    const userId = user?.id
    if (!userId) { setError('계정 정보를 가져올 수 없어요'); setLoading(false); return }

    const { data: existing } = await supabase
      .from('members')
      .select('nickname, user_id')
      .eq('nickname', nickname.trim())
      .maybeSingle()

    if (existing) {
      await supabase.from('members').update({ user_id: userId }).eq('nickname', nickname.trim())
    } else {
      await supabase.from('members').insert({ nickname: nickname.trim(), user_id: userId, egg_type: 'star' })
    }

    const fullAddress = addressDetail ? `${address} ${addressDetail}` : address
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, realName, phone, address: fullAddress, privacyAgreed, stravaAgreed }),
    })

    router.push('/')
    setLoading(false)
  }

  const isLogin = phase >= 1
  const showForm = view === 'login' || view === 'signup'
  const pwMatch = signupPassword.length > 0 && passwordConfirm.length > 0 && signupPassword === passwordConfirm

  function goBack() {
    setView('main'); setError('')
    setNickname(''); setNicknameChecked(false); setNicknameMsg('')
    setEmail(''); setPassword('')
    setSignupEmail(''); setEmailVerified(false); setOtpSent(false); setOtpCode(''); setOtpMsg('')
    setSignupPassword(''); setPasswordConfirm('')
    setRealName(''); setPhone(''); setAddress(''); setAddressDetail('')
    setPrivacyAgreed(false); setStravaAgreed(false)
  }

  return (
    <div className="login-wrap">
      <div className={`login-bg-layer ${isLogin ? 'login-bg-visible' : ''}`} />
      <div className={`login-overlay ${showForm ? 'overlay-visible' : ''}`} />

      <button
        className={`auth-back-arrow ${showForm ? 'arrow-visible' : 'arrow-hidden'}`}
        onClick={goBack}
      >←</button>

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

      {/* 메인 버튼 */}
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
          <div className="pw-row">
            <input className="auth-input" type={showLoginPw ? 'text' : 'password'} placeholder="비밀번호"
              value={password} onChange={e => setPassword(e.target.value)} />
            <button className="pw-eye" type="button" onClick={() => setShowLoginPw(v => !v)}>
              {showLoginPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button className="login-btn-main" onClick={handleLogin} disabled={loading}>
            {loading ? '...' : '로그인'}
          </button>
        </div>
      </div>

      {/* 회원가입 폼 */}
      <div className={`login-bottom form-panel signup-panel ${view === 'signup' ? 'bottom-visible' : 'bottom-hidden'}`}>
        <p className="auth-title">회원가입</p>
        <div className="auth-form">

          {/* 닉네임 */}
          <div className="nickname-row">
            <input className="auth-input nickname-input" placeholder="닉네임 (기존 크루원은 본인 닉네임)"
              value={nickname} onChange={e => { setNickname(e.target.value); setNicknameChecked(false); setNicknameMsg('') }} />
            <button className="nickname-check-btn" onClick={checkNickname} type="button">중복확인</button>
          </div>
          {nicknameMsg && (
            <p className={`nickname-msg ${nicknameChecked ? 'nickname-ok' : 'nickname-err'}`}>{nicknameMsg}</p>
          )}

          {/* 실명 */}
          <input className="auth-input" placeholder="실명"
            value={realName} onChange={e => setRealName(e.target.value)} />

          {/* 이메일 + 인증 */}
          <div className="nickname-row">
            <input className="auth-input nickname-input" type="email" placeholder="이메일"
              value={signupEmail}
              onChange={e => { setSignupEmail(e.target.value); setEmailVerified(false); setOtpSent(false); setOtpCode(''); setOtpMsg('') }}
              disabled={emailVerified} />
            <button className="nickname-check-btn" onClick={sendOtp} type="button" disabled={otpLoading || emailVerified}>
              {emailVerified ? '✓' : otpSent ? '재발송' : '인증코드 발송'}
            </button>
          </div>
          {otpSent && !emailVerified && (
            <div className="nickname-row">
              <input className="auth-input nickname-input" placeholder="인증코드 입력"
                value={otpCode} onChange={e => setOtpCode(e.target.value)} maxLength={8} />
              <button className="nickname-check-btn" onClick={verifyOtp} type="button" disabled={otpLoading}>
                확인
              </button>
            </div>
          )}
          {otpMsg && (
            <p className={`nickname-msg ${emailVerified ? 'nickname-ok' : 'nickname-err'}`}>{otpMsg}</p>
          )}

          {/* 비밀번호 */}
          <div className="pw-row">
            <input className="auth-input" type={showSignupPw ? 'text' : 'password'}
              placeholder="비밀번호 (8자↑, 소문자·숫자·특수문자)"
              value={signupPassword} onChange={e => setSignupPassword(e.target.value)} />
            <button className="pw-eye" type="button" onClick={() => setShowSignupPw(v => !v)}>
              {showSignupPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {/* 비밀번호 확인 */}
          <div className="pw-row">
            <input className="auth-input" type={showSignupPwConfirm ? 'text' : 'password'}
              placeholder="비밀번호 확인"
              value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
            <button className="pw-eye" type="button" onClick={() => setShowSignupPwConfirm(v => !v)}>
              {showSignupPwConfirm ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            {pwMatch && <span className="pw-match-check">✓</span>}
          </div>

          {/* 전화번호 */}
          <input className="auth-input" type="tel" placeholder="전화번호 (010-0000-0000)"
            value={phone} onChange={e => setPhone(e.target.value)} />

          {/* 주소 검색 */}
          <div className="address-row">
            <input className="auth-input address-input" placeholder="주소 검색"
              value={address} readOnly />
            <button className="nickname-check-btn" type="button" onClick={openAddressSearch}>검색</button>
          </div>
          {address && (
            <input className="auth-input" placeholder="상세주소 (동/호수 등)"
              value={addressDetail} onChange={e => setAddressDetail(e.target.value)} />
          )}

          {/* 동의 */}
          <div className="consent-box">
            <label className="consent-row">
              <input type="checkbox" checked={privacyAgreed} onChange={e => setPrivacyAgreed(e.target.checked)} />
              <span>[필수] 개인정보 수집·이용 동의 (실명, 전화, 주소 — 협찬 배송 목적)</span>
            </label>
            <label className="consent-row">
              <input type="checkbox" checked={stravaAgreed} onChange={e => setStravaAgreed(e.target.checked)} />
              <span>[필수] 스트라바 활동 데이터 연동 동의 (점수 산출 목적)</span>
            </label>
          </div>

          {error && <p className="auth-error">{error}</p>}
          <button className="login-btn-main" onClick={handleSignup} disabled={loading}>
            {loading ? '...' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
