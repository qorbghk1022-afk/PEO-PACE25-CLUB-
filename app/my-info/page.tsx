'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

export default function MyInfoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [lv, setLv] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ real_name: string; phone: string; address: string } | null>(null)
  const [stravaConnected, setStravaConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  // 닉네임 수정
  const [editingNickname, setEditingNickname] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [nicknameMsg, setNicknameMsg] = useState('')

  // 챌린지 중단
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveReason, setLeaveReason] = useState('병가')
  const [leaveDetail, setLeaveDetail] = useState('')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveMsg, setLeaveMsg] = useState('')
  const [currentChallengeId, setCurrentChallengeId] = useState<string | null>(null)
  const [leaveDisabled, setLeaveDisabled] = useState(false)

  // 개인정보 수정
  const [editingProfile, setEditingProfile] = useState(false)
  const [editRealName, setEditRealName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [profileMsg, setProfileMsg] = useState('')

  // 사진 업로드
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: member } = await supabase.from('members').select('nickname, lv, avatar_url')
        .eq('user_id', session.user.id).maybeSingle()
      if (member) {
        setNickname(member.nickname)
        setLv(member.lv)
        setAvatarUrl(member.avatar_url)
      }

      // 프로필
      const res = await fetchWithAuth('/api/profile/get')
      if (res.ok) setProfile(await res.json())

      // Strava
      const { data: st } = await supabase.from('strava_tokens').select('id').eq('user_id', session.user.id).maybeSingle()
      setStravaConnected(!!st)

      // 현재 챌린지
      const { data: ch } = await supabase.from('challenges').select('id, start_date')
        .gte('end_date', `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)
        .order('start_date', { ascending: false }).limit(1).maybeSingle()
      if (ch) {
        setCurrentChallengeId(ch.id)
        const days = Math.floor((Date.now() - new Date(ch.start_date).getTime()) / (1000 * 60 * 60 * 24))
        setLeaveDisabled(days > 7)
      }

      setLoading(false)
    })
  }, [router])

  async function handleNicknameSave() {
    if (!newNickname.trim()) return
    const banned = ['시발','씨발','병신','지랄','개새끼','fuck','shit','bitch','asshole','nigger','sex','섹스','야동','porn','죽어','살인']
    if (banned.some(w => newNickname.trim().toLowerCase().includes(w))) { setNicknameMsg('사용할 수 없는 닉네임이에요'); return }
    const { data: existing } = await supabase.from('members').select('nickname').eq('nickname', newNickname.trim()).maybeSingle()
    if (existing) { setNicknameMsg('이미 사용 중인 닉네임이에요'); return }
    await supabase.from('members').update({ nickname: newNickname.trim() }).eq('nickname', nickname)
    setNickname(newNickname.trim())
    setEditingNickname(false)
    setNicknameMsg('변경되었습니다')
  }

  async function handleProfileSave() {
    const res = await fetchWithAuth('/api/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ realName: editRealName, phone: editPhone, address: editAddress, privacyAgreed: true })
    })
    if (res.ok) {
      setProfile({ real_name: editRealName, phone: editPhone, address: editAddress })
      setEditingProfile(false)
      setProfileMsg('저장되었습니다')
    } else {
      setProfileMsg('저장 실패')
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${userId}/avatar.${ext}`
    await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`
    await supabase.from('members').update({ avatar_url: url }).eq('user_id', userId)
    setAvatarUrl(url)
    setUploading(false)
  }

  async function handleLeaveSubmit() {
    if (!currentChallengeId || !nickname) return
    if (!leaveStart || !leaveEnd) { setLeaveMsg('중단 기간을 선택해주세요'); return }
    if (leaveStart > leaveEnd) { setLeaveMsg('시작일이 종료일보다 늦을 수 없습니다'); return }
    const res = await fetchWithAuth('/api/challenge/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, challengeId: currentChallengeId, reason: leaveReason, reasonDetail: leaveDetail, leaveStart, leaveEnd })
    })
    const data = await res.json()
    if (res.ok) {
      setLeaveMsg('중단 신청이 완료되었습니다. 크루장 승인을 기다려주세요.')
      setShowLeaveForm(false)
    } else {
      setLeaveMsg(data.error || '신청 실패')
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('정말 탈퇴할까요? 모든 개인정보가 삭제됩니다.')) return
    await fetchWithAuth('/api/delete-account', { method: 'POST' })
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <div className="admin-loading">로딩 중...</div>

  return (
    <div className="myinfo-page">
      <header className="admin-header">
        <button className="cs-back" onClick={() => router.back()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 className="admin-title">내 정보</h1>
        <div style={{ width: 40 }} />
      </header>

      <div className="myinfo-body">
        {/* 프로필 사진 */}
        <div className="myinfo-avatar-section">
          <label className="myinfo-avatar-label">
            <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={uploading} />
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="myinfo-avatar" />
            ) : (
              <div className="myinfo-avatar-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            )}
            <div className="myinfo-avatar-badge">{uploading ? '...' : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6V4h8v2"/></svg>}</div>
          </label>
          <div className="myinfo-name-area">
            <div className="myinfo-lv">LV.{lv}</div>
            <div className="myinfo-nickname">{nickname}</div>
          </div>
        </div>

        {/* 닉네임 수정 */}
        <div className="myinfo-section">
          <div className="myinfo-section-title">닉네임</div>
          {editingNickname ? (
            <div className="myinfo-edit-row">
              <input className="myinfo-input" value={newNickname} onChange={e => setNewNickname(e.target.value)} placeholder="새 닉네임" />
              <button className="myinfo-save-btn" onClick={handleNicknameSave}>저장</button>
              <button className="myinfo-cancel-btn" onClick={() => setEditingNickname(false)}>취소</button>
            </div>
          ) : (
            <div className="myinfo-row">
              <span>{nickname}</span>
              <button className="myinfo-edit-btn" onClick={() => { setEditingNickname(true); setNewNickname(nickname) }}>수정</button>
            </div>
          )}
          {nicknameMsg && <p className="myinfo-msg">{nicknameMsg}</p>}
        </div>

        {/* 개인정보 */}
        <div className="myinfo-section">
          <div className="myinfo-section-header">
            <div className="myinfo-section-title">개인정보</div>
            {!editingProfile && (
              <button className="myinfo-edit-btn" onClick={() => {
                setEditRealName(profile?.real_name || '')
                setEditPhone(profile?.phone || '')
                setEditAddress(profile?.address || '')
                setEditingProfile(true)
                setProfileMsg('')
              }}>수정</button>
            )}
          </div>
          {editingProfile ? (
            <div className="myinfo-leave-form">
              <input className="myinfo-input" placeholder="실명" value={editRealName} onChange={e => setEditRealName(e.target.value)} />
              <input className="myinfo-input" placeholder="전화번호" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
              <input className="myinfo-input" placeholder="주소" value={editAddress} onChange={e => setEditAddress(e.target.value)} />
              <div className="myinfo-edit-row">
                <button className="myinfo-save-btn" onClick={handleProfileSave}>저장</button>
                <button className="myinfo-cancel-btn" onClick={() => setEditingProfile(false)}>취소</button>
              </div>
            </div>
          ) : (
            <>
              <div className="myinfo-row"><span className="myinfo-label">실명</span><span>{profile?.real_name || '-'}</span></div>
              <div className="myinfo-row"><span className="myinfo-label">전화번호</span><span>{profile?.phone || '-'}</span></div>
              <div className="myinfo-row"><span className="myinfo-label">주소</span><span className="myinfo-address">{profile?.address || '-'}</span></div>
            </>
          )}
          {profileMsg && <p className="myinfo-msg">{profileMsg}</p>}
        </div>

        {/* Strava 연동 */}
        <div className="myinfo-section">
          <div className="myinfo-section-title">Strava</div>
          {stravaConnected ? (
            <>
              <div className="myinfo-row strava-connected-row">
                <img src="/powered_by_strava.png" alt="Powered by Strava" className="strava-powered-logo" />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#27ae60" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div className="myinfo-row">
                <span>연동 해제</span>
                <button className="myinfo-edit-btn" onClick={async () => {
                  if (!confirm('Strava 연동을 해제할까요? PEO 계정은 유지되며, 자동 동기화가 중단됩니다.')) return
                  await supabase.from('strava_tokens').delete().eq('user_id', userId!)
                  await supabase.from('members').update({ strava_athlete_id: null }).eq('user_id', userId!)
                  setStravaConnected(false)
                  alert('Strava 연동이 해제되었습니다.')
                }}>해제</button>
              </div>
              <div className="myinfo-row">
                <span>데이터 삭제</span>
                <button className="myinfo-edit-btn" onClick={async () => {
                  if (!confirm('Strava에서 가져온 활동 데이터를 삭제할까요? PEO 점수는 유지됩니다.')) return
                  const res = await fetchWithAuth('/api/strava/delete-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname }),
                  })
                  if (res.ok) {
                    const data = await res.json()
                    alert(`Strava 활동 데이터 ${data.deleted}건이 삭제되었습니다.`)
                  } else {
                    alert('삭제 실패. 다시 시도해주세요.')
                  }
                }}>삭제</button>
              </div>
            </>
          ) : (
            <div className="myinfo-row">
              <a href={`/api/strava/auth?userId=${userId}`}>
                <img src="/btn_strava_connect.png" alt="Connect with Strava" className="strava-connect-btn" />
              </a>
            </div>
          )}
        </div>

        {/* 챌린지 중단 신청 */}
        <div className="myinfo-section">
          <div className="myinfo-section-title">챌린지 중단</div>
          {leaveDisabled ? (
            <div className="myinfo-row"><span>챌린지 중단</span><span style={{ fontSize: 12, color: '#999' }}>7일 경과</span></div>
          ) : !currentChallengeId ? (
            <div className="myinfo-row"><span>챌린지 중단</span><span style={{ fontSize: 12, color: '#999' }}>진행 중 없음</span></div>
          ) : showLeaveForm ? (
            <div className="myinfo-leave-form">
              <select className="myinfo-select" value={leaveReason} onChange={e => setLeaveReason(e.target.value)}>
                <option value="병가">병가</option>
                <option value="출산휴가">출산휴가</option>
                <option value="기타">기타</option>
              </select>
              {leaveReason === '기타' && (
                <input className="myinfo-input" placeholder="사유를 입력해주세요" value={leaveDetail} onChange={e => setLeaveDetail(e.target.value)} />
              )}
              <div className="myinfo-section-title" style={{ marginTop: 8 }}>중단 기간</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" className="myinfo-input" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} />
                <span>~</span>
                <input type="date" className="myinfo-input" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} />
              </div>
              <div className="myinfo-edit-row" style={{ marginTop: 8 }}>
                <button className="myinfo-save-btn" onClick={handleLeaveSubmit}>신청</button>
                <button className="myinfo-cancel-btn" onClick={() => setShowLeaveForm(false)}>취소</button>
              </div>
            </div>
          ) : (
            <div className="myinfo-row">
              <span>챌린지 중단</span>
              <button className="myinfo-edit-btn" onClick={() => setShowLeaveForm(true)}>신청</button>
            </div>
          )}
          {leaveMsg && <p className="myinfo-msg">{leaveMsg}</p>}
        </div>

        {/* 약관 */}
        <div className="myinfo-section myinfo-links">
          <a href="/policy/terms" className="myinfo-link">서비스 이용약관 ›</a>
          <a href="/policy/privacy" className="myinfo-link">개인정보 처리방침 ›</a>
          <a href="/policy/all" className="myinfo-link">이용약관 및 개인정보 처리방침 ›</a>
        </div>

        {/* 문의 */}
        <div className="myinfo-section" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#999', margin: '8px 0' }}>문의: a5214275@naver.com</p>
        </div>

        {/* 로그아웃 / 탈퇴 */}
        <div className="myinfo-section">
          <button className="myinfo-logout" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>로그아웃</button>
          <button className="myinfo-delete" onClick={handleDeleteAccount}>회원탈퇴</button>
        </div>
      </div>
    </div>
  )
}
