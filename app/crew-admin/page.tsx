'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

interface MemberRow {
  nickname: string
  lv: number
  total_dist: number
  is_active: boolean
  user_id: string | null
}

export default function CrewAdminPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [isLeader, setIsLeader] = useState(false)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [crewName, setCrewName] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [joinRequests, setJoinRequests] = useState<{ id: string; member_nickname: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'members' | 'requests' | 'season'>('members')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      // 크루장 확인
      const { data: crew } = await supabase.from('crews').select('id, name').eq('leader_user_id', session.user.id).maybeSingle()
      if (!crew) { router.push('/'); return }

      setIsLeader(true)
      setCrewId(crew.id)
      setCrewName(crew.name)

      // 멤버 로드
      const { data: mems } = await supabase.from('members').select('nickname, lv, total_dist, is_active, user_id').eq('crew_id', crew.id)
      setMembers((mems || []) as MemberRow[])

      // 가입 신청 로드
      const { data: reqs } = await supabase.from('crew_join_requests').select('id, member_nickname, created_at').eq('crew_id', crew.id).eq('status', 'pending')
      setJoinRequests(reqs || [])

      setLoading(false)
    })
  }, [router])

  async function handleKick(nickname: string) {
    if (!confirm(`${nickname}님을 정말 강퇴할까요?`)) return
    await supabase.from('crew_members').delete().eq('crew_id', crewId).eq('member_nickname', nickname)
    await supabase.from('members').update({ crew_id: null }).eq('nickname', nickname)
    setMembers(prev => prev.filter(m => m.nickname !== nickname))
  }

  async function handleApprove(requestId: string) {
    await fetchWithAuth('/api/crew/handle-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action: 'approve' })
    })
    setJoinRequests(prev => prev.filter(r => r.id !== requestId))
  }

  async function handleReject(requestId: string) {
    await fetchWithAuth('/api/crew/handle-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action: 'reject' })
    })
    setJoinRequests(prev => prev.filter(r => r.id !== requestId))
  }

  async function handleManualSync() {
    if (!confirm('스프레드시트에서 데이터를 동기화할까요?')) return
    const res = await fetch('/api/cron', { headers: { Authorization: `Bearer ${prompt('CRON_SECRET 입력:')}` } })
    const data = await res.json()
    alert(JSON.stringify(data, null, 2))
  }

  if (loading) return <div className="admin-loading">로딩 중...</div>
  if (!isLeader) return null

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="cs-back" onClick={() => router.push('/')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 className="admin-title">{crewName} 관리</h1>
        <div style={{ width: 40 }} />
      </header>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>회원 ({members.length})</button>
        <button className={`admin-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>가입신청 ({joinRequests.length})</button>
        <button className={`admin-tab ${tab === 'season' ? 'active' : ''}`} onClick={() => setTab('season')}>시즌 관리</button>
      </div>

      <div className="admin-body">
        {tab === 'members' && (
          <div className="admin-members">
            {members.map(m => (
              <div key={m.nickname} className="admin-member-row">
                <div className="admin-member-info">
                  <span className="admin-member-name">{m.nickname}</span>
                  <span className="admin-member-sub">LV.{m.lv} | {m.total_dist?.toFixed(1) || 0}km</span>
                </div>
                <button className="admin-kick-btn" onClick={() => handleKick(m.nickname)}>강퇴</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'requests' && (
          <div className="admin-requests">
            {joinRequests.length === 0 && <p className="admin-empty">대기 중인 가입 신청이 없습니다</p>}
            {joinRequests.map(r => (
              <div key={r.id} className="admin-request-row">
                <div className="admin-member-info">
                  <span className="admin-member-name">{r.member_nickname || '새 멤버'}</span>
                  <span className="admin-member-sub">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="admin-request-actions">
                  <button className="admin-approve-btn" onClick={() => handleApprove(r.id)}>수락</button>
                  <button className="admin-reject-btn" onClick={() => handleReject(r.id)}>거절</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'season' && (
          <div className="admin-season">
            <button className="admin-action-btn" onClick={handleManualSync}>데이터 동기화 (스프레드시트)</button>
            <button className="admin-action-btn" onClick={() => alert('준비중입니다')}>시즌 수동 전환</button>
          </div>
        )}
      </div>
    </div>
  )
}
