'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface CrewItem {
  id: string
  name: string
  description: string | null
  image_url: string | null
  color: string | null
  max_members: number
  member_count: number
}

const RANDOM_COLORS = ['#A51C30', '#2d5fa0', '#e67e22', '#27ae60', '#8e44ad', '#e74c3c', '#16a085', '#f39c12', '#2c3e50', '#d35400']

export default function CrewSelectPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [mode, setMode] = useState<'select' | 'create' | 'browse'>('select')
  const [crews, setCrews] = useState<CrewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [selectedCrew, setSelectedCrew] = useState<CrewItem | null>(null)
  const [myCrewIds, setMyCrewIds] = useState<string[]>([])

  // 크루 만들기 폼
  const [crewName, setCrewName] = useState('')
  const [crewDesc, setCrewDesc] = useState('')
  const [crewImage, setCrewImage] = useState<File | null>(null)
  const [crewImagePreview, setCrewImagePreview] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      // 크루가 있어도 /crew-select 접근 가능 (다중 가입 지원)
      supabase.from('members').select('nickname').eq('user_id', session.user.id).maybeSingle()
        .then(({ data }) => { if (data) setNickname(data.nickname) })
      setLoading(false)
    })
  }, [router])

  async function loadCrews() {
    const { data } = await supabase.from('crews').select('*')
    if (data) {
      const crewsWithCount = await Promise.all(data.map(async (c) => {
        const { count } = await supabase.from('crew_members').select('id', { count: 'exact', head: true }).eq('crew_id', c.id)
        return { ...c, member_count: count || 0 } as CrewItem
      }))
      setCrews(crewsWithCount)
    }
    // 내가 가입된 크루 목록
    if (userId) {
      const { data: myCrews } = await supabase.from('crew_members').select('crew_id').eq('user_id', userId)
      setMyCrewIds((myCrews || []).map(c => c.crew_id))
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCrewImage(file)
    const reader = new FileReader()
    reader.onload = () => setCrewImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleCreate() {
    if (!crewName.trim() || !userId || !agreed) return
    setSubmitting(true)
    setMsg('')

    let imageUrl: string | null = null
    const color = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)]

    if (crewImage) {
      const ext = crewImage.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('crew-images').upload(path, crewImage)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(path)
        imageUrl = publicUrl
      }
    }

    const res = await fetch('/api/crew/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId, nickname, name: crewName.trim(),
        description: crewDesc.trim(), imageUrl, color
      })
    })
    const data = await res.json()
    if (!res.ok) { setMsg(data.error); setSubmitting(false); return }
    if (data.crew?.id) localStorage.setItem('peo_active_crew', data.crew.id)
    router.push('/')
  }

  async function handleJoinRequest(crewId: string) {
    if (!userId) return
    setSubmitting(true)
    setMsg('')
    const res = await fetch('/api/crew/join-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, crewId, nickname })
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setMsg(data.error); return }
    setMsg('가입 신청 완료! 크루장의 승인을 기다려주세요.')
    setSelectedCrew(null)
  }

  if (loading) return <div className="cs-loading">로딩 중...</div>

  return (
    <div className={`cs-page ${mode === 'browse' ? 'cs-dark' : ''}`}>
      <header className={`cs-header ${mode === 'browse' ? 'cs-header-dark' : ''}`}>
        <button className="cs-back" onClick={() => {
          if (mode === 'select') { supabase.auth.signOut(); router.push('/login') }
          else { setMode('select'); setMsg(''); setSelectedCrew(null) }
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={mode === 'browse' ? '#fff' : '#111'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <img src={mode === 'browse' ? '/peo-logo-center.png' : '/peo-logo-black.png'} alt="PEO" className="cs-header-logo" />
        <div className="cs-header-spacer" />
      </header>

      <div className="cs-body">
        {/* 모드: 선택 */}
        {mode === 'select' && (
          <>
            <h1 className="cs-title">크루를 선택하세요</h1>
            <p className="cs-subtitle">러닝 크루에 가입하거나 새로운 크루를 만들어보세요</p>
            <div className="cs-buttons">
              <button className="cs-btn" onClick={() => setMode('create')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>크루 만들기</span>
              </button>
              <button className="cs-btn" onClick={() => { setMode('browse'); loadCrews() }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>크루 찾기</span>
              </button>
            </div>
          </>
        )}

        {/* 모드: 만들기 */}
        {mode === 'create' && (
          <div className="cs-form">
            <h2 className="cs-form-title">어떤 크루를 만들까요?</h2>

            {/* 크루 이미지 */}
            <label className="cs-img-upload">
              <input type="file" accept="image/*" hidden onChange={handleImageSelect} />
              {crewImagePreview ? (
                <img src={crewImagePreview} alt="" className="cs-img-preview" />
              ) : (
                <div className="cs-img-placeholder">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6V4h8v2"/></svg>
                  <span>크루 이미지</span>
                </div>
              )}
            </label>

            <label className="cs-label">크루명</label>
            <input
              className="cs-input"
              placeholder="10글자 이하로 입력해주세요"
              value={crewName}
              onChange={e => { if (e.target.value.length <= 20) setCrewName(e.target.value) }}
              maxLength={20}
            />
            <div className="cs-char-count">{crewName.length}/20</div>

            <label className="cs-label">소개</label>
            <textarea
              className="cs-textarea"
              placeholder="나의 크루를 소개해주세요"
              value={crewDesc}
              onChange={e => setCrewDesc(e.target.value)}
              rows={4}
            />

            <label className="cs-agree">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span><a href="/policy/terms" target="_blank" className="cs-agree-link">운영회칙</a>에 동의합니다</span>
            </label>

            {msg && <p className="cs-msg">{msg}</p>}

            <button className="cs-submit" onClick={handleCreate} disabled={submitting || !crewName.trim() || !agreed}>
              {submitting ? '생성 중...' : '크루 생성'}
            </button>
          </div>
        )}

        {/* 모드: 가입 - 원형 그리드 */}
        {mode === 'browse' && (
          <div className="cs-browse-wrap">
            <h2 className="cs-browse-title">크루 찾기</h2>
            <p className="cs-browse-sub">가입하고 싶은 크루를 선택하세요</p>

            {crews.length === 0 && <p className="cs-browse-empty">등록된 크루가 없습니다</p>}

            <div className="cs-circle-grid">
              {crews.map((c, i) => {
                const bgColor = c.color || RANDOM_COLORS[i % RANDOM_COLORS.length]
                return (
                  <button
                    key={c.id}
                    className={`cs-circle ${selectedCrew?.id === c.id ? 'cs-circle-active' : ''}`}
                    onClick={() => {
                      if (myCrewIds.includes(c.id)) {
                        // 이미 가입된 크루 → 해당 크루로 전환 후 입장
                        localStorage.setItem('peo_active_crew', c.id)
                        router.push('/')
                      } else {
                        setSelectedCrew(selectedCrew?.id === c.id ? null : c)
                      }
                    }}
                  >
                    {c.image_url ? (
                      <img src={c.image_url} alt="" className="cs-circle-img" />
                    ) : (
                      <div className="cs-circle-color" style={{ background: bgColor }}>
                        <span>{c.name.slice(0, 3)}</span>
                      </div>
                    )}
                    {/* 호버/선택 오버레이 */}
                    <div className="cs-circle-overlay">
                      <span className="cs-circle-name">{c.name}</span>
                      <span className="cs-circle-count">{c.member_count}명</span>
                    </div>
                    {myCrewIds.includes(c.id) && <div className="cs-circle-joined">가입됨</div>}
                  </button>
                )
              })}
            </div>

            {msg && <p className="cs-browse-msg">{msg}</p>}

            {/* 선택된 크루 상세 */}
            {selectedCrew && (
              <div className="cs-crew-detail">
                <div className="cs-crew-detail-name">{selectedCrew.name}</div>
                {selectedCrew.description && <div className="cs-crew-detail-desc">{selectedCrew.description}</div>}
                <div className="cs-crew-detail-count">{selectedCrew.member_count}/{selectedCrew.max_members}명</div>
                <button
                  className="cs-crew-detail-btn"
                  onClick={() => handleJoinRequest(selectedCrew.id)}
                  disabled={submitting || selectedCrew.member_count >= selectedCrew.max_members}
                >
                  {submitting ? '신청 중...' : '가입 신청'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
