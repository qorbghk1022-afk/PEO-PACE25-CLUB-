'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

interface MemberRow { nickname: string; lv: number; total_dist: number; is_active: boolean; user_id: string | null; remark: string | null; strava: boolean; leave_start: string | null; leave_end: string | null; leave_reason: string | null }
interface LeaveRow { id: string; member_nickname: string; reason: string; reason_detail: string | null; status: string; requested_at: string }
interface PaymentRow { id: string; member_nickname: string; type: string; amount: number; status: string }
interface JoinReqRow { id: string; member_nickname: string; created_at: string }

export default function CrewAdminPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [crewName, setCrewName] = useState('')
  const [tab, setTab] = useState<'members' | 'leaves' | 'payments' | 'requests'>('members')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinReqRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      const { data: crew } = await supabase.from('crews').select('id, name').eq('leader_user_id', session.user.id).maybeSingle()
      if (!crew) { router.push('/'); return }
      setCrewId(crew.id)
      setCrewName(crew.name)
      loadAll(crew.id)
    })
  }, [router])

  async function loadAll(cid: string) {
    const [{ data: mems }, { data: lvs }, { data: reqs }] = await Promise.all([
      supabase.from('members').select('nickname, lv, total_dist, is_active, user_id, remark, leave_start, leave_end, leave_reason').eq('crew_id', cid),
      supabase.from('challenge_leaves').select('*').eq('status', 'pending'),
      supabase.from('crew_join_requests').select('id, member_nickname, created_at').eq('crew_id', cid).eq('status', 'pending'),
    ])
    const memsWithStrava = await Promise.all((mems || []).map(async (m) => {
      if (!m.user_id) return { ...m, strava: false }
      const { data } = await supabase.from('strava_tokens').select('id').eq('user_id', m.user_id).maybeSingle()
      return { ...m, strava: !!data }
    }))
    setMembers(memsWithStrava as MemberRow[])
    setLeaves((lvs || []) as LeaveRow[])
    setJoinRequests((reqs || []) as JoinReqRow[])
    const { data: pays } = await supabase.from('payments').select('*').order('created_at', { ascending: false })
    setPayments((pays || []) as PaymentRow[])
    setLoading(false)
  }

  async function handleKick(nickname: string) {
    if (!confirm(`${nickname}님을 정말 강퇴할까요?`)) return
    await supabase.from('crew_members').delete().eq('crew_id', crewId).eq('member_nickname', nickname)
    await supabase.from('members').update({ crew_id: null }).eq('nickname', nickname)
    setMembers(prev => prev.filter(m => m.nickname !== nickname))
  }

  async function handleRemarkSave(nickname: string, remark: string) {
    await supabase.from('members').update({ remark }).eq('nickname', nickname)
    setMembers(prev => prev.map(m => m.nickname === nickname ? { ...m, remark } : m))
  }

  async function handleLeaveAction(leaveId: string, action: 'approve' | 'reject') {
    await fetchWithAuth('/api/challenge/leave', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveId, action })
    })
    setLeaves(prev => prev.filter(l => l.id !== leaveId))
  }

  async function handlePaymentConfirm(paymentId: string) {
    await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', paymentId)
    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'paid' } : p))
  }

  async function handleJoinAction(requestId: string, action: 'approve' | 'reject') {
    await fetchWithAuth('/api/crew/handle-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action })
    })
    setJoinRequests(prev => prev.filter(r => r.id !== requestId))
  }

  if (loading) return <div className="admin-loading">로딩 중...</div>

  const unpaidCount = payments.filter(p => p.status === 'unpaid').length
  const unpaidTotal = payments.filter(p => p.status === 'unpaid').reduce((s, p) => s + p.amount, 0)
  const authCount = members.filter(m => m.user_id).length
  const stravaCount = members.filter(m => m.strava).length

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="cs-back" onClick={() => { window.location.href = '/' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 className="admin-title">{crewName} 관리</h1>
        <div style={{ width: 40 }} />
      </header>

      <div className="admin-summary">
        <div className="admin-summary-item"><span className="admin-summary-num">{members.length}</span><span>전체</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{authCount}</span><span>가입</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{stravaCount}</span><span>Strava</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{leaves.length}</span><span>중단</span></div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>회원</button>
        <button className={`admin-tab ${tab === 'leaves' ? 'active' : ''}`} onClick={() => setTab('leaves')}>중단</button>
        <button className={`admin-tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>납부</button>
        <button className={`admin-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>가입</button>
      </div>

      <div className="admin-body">
        {tab === 'members' && members.map(m => (
          <div key={m.nickname} className="admin-member-row">
            <div className="admin-member-info">
              <div className="admin-member-name">
                {m.nickname}
                {m.user_id && <span className="admin-badge auth">가입</span>}
                {m.strava && <span className="admin-badge strava">S</span>}
                {!m.user_id && <span className="admin-badge pending">미연동</span>}
              </div>
              <div className="admin-member-sub">
                LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km
                {m.remark && <span className="admin-remark"> | {m.remark}</span>}
              </div>
            </div>
            <div className="admin-member-actions">
              <button className="admin-sm-btn" onClick={() => {
                const r = prompt('비고:', m.remark || '')
                if (r !== null) handleRemarkSave(m.nickname, r)
              }}>비고</button>
              <button className="admin-kick-btn" onClick={() => handleKick(m.nickname)}>강퇴</button>
            </div>
          </div>
        ))}

        {tab === 'leaves' && (
          <>
            {/* 현재 휴식 중인 멤버 */}
            <div className="admin-section-label">휴식 중인 멤버</div>
            {members.filter(m => m.leave_start && m.leave_end && m.leave_end >= new Date().toISOString().slice(0,10)).length === 0 && (
              <p className="admin-empty-sm">휴식 중인 멤버가 없습니다</p>
            )}
            {members.filter(m => m.leave_start && m.leave_end && m.leave_end >= new Date().toISOString().slice(0,10)).map(m => (
              <div key={m.nickname} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{m.nickname} <span className="admin-badge strava">{m.leave_reason}</span></div>
                  <div className="admin-member-sub">{m.leave_start} ~ {m.leave_end}</div>
                </div>
                <button className="admin-sm-btn" onClick={async () => {
                  await supabase.from('members').update({ leave_start: null, leave_end: null, leave_reason: null }).eq('nickname', m.nickname)
                  setMembers(prev => prev.map(x => x.nickname === m.nickname ? { ...x, leave_start: null, leave_end: null, leave_reason: null } : x))
                  alert(`${m.nickname}님 휴식 해제 완료`)
                }}>해제</button>
              </div>
            ))}

            {/* 휴식 설정 */}
            <div className="admin-section-label" style={{ marginTop: 16 }}>휴식 설정</div>
            <div className="admin-leave-form">
              <select id="leave-member" className="myinfo-select">
                <option value="">멤버 선택</option>
                {members.filter(m => !m.leave_start).map(m => <option key={m.nickname} value={m.nickname}>{m.nickname}</option>)}
              </select>
              <select id="leave-reason" className="myinfo-select">
                <option value="병가">병가</option>
                <option value="출산휴가">출산휴가</option>
                <option value="기타">기타</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" id="leave-start" className="myinfo-input" />
                <span style={{ lineHeight: '40px' }}>~</span>
                <input type="date" id="leave-end" className="myinfo-input" />
              </div>
              <button className="admin-approve-btn" onClick={async () => {
                const nick = (document.getElementById('leave-member') as HTMLSelectElement).value
                const reason = (document.getElementById('leave-reason') as HTMLSelectElement).value
                const start = (document.getElementById('leave-start') as HTMLInputElement).value
                const end = (document.getElementById('leave-end') as HTMLInputElement).value
                if (!nick || !start || !end) { alert('모든 항목을 입력해주세요'); return }
                await supabase.from('members').update({ leave_start: start, leave_end: end, leave_reason: reason }).eq('nickname', nick)
                setMembers(prev => prev.map(m => m.nickname === nick ? { ...m, leave_start: start, leave_end: end, leave_reason: reason } : m))
                alert(`${nick}님 휴식 설정 완료 (${start} ~ ${end})`)
              }}>휴식 설정</button>
            </div>

            {/* 대기 중인 신청 */}
            <div className="admin-section-label" style={{ marginTop: 16 }}>대기 중인 중단 신청</div>
            {leaves.length === 0 && <p className="admin-empty-sm">대기 중인 중단 신청이 없습니다</p>}
            {leaves.map(l => (
              <div key={l.id} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{l.member_nickname}</div>
                  <div className="admin-member-sub">{l.reason}{l.reason_detail ? ` - ${l.reason_detail}` : ''} | {new Date(l.requested_at).toLocaleDateString()}</div>
                </div>
                <div className="admin-request-actions">
                  <button className="admin-approve-btn" onClick={() => handleLeaveAction(l.id, 'approve')}>수락</button>
                  <button className="admin-reject-btn" onClick={() => handleLeaveAction(l.id, 'reject')}>거절</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'payments' && (
          <>
            {unpaidCount > 0 && <div className="admin-unpaid-summary">미납 {unpaidCount}건 | ₩{unpaidTotal.toLocaleString()}</div>}
            {payments.length === 0 && <p className="admin-empty">납부 내역이 없습니다</p>}
            {payments.map(p => (
              <div key={p.id} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{p.member_nickname}</div>
                  <div className="admin-member-sub">{p.type} | ₩{p.amount.toLocaleString()} | {p.status === 'paid' ? '납부완료' : '미납'}</div>
                </div>
                {p.status === 'unpaid' && <button className="admin-approve-btn" onClick={() => handlePaymentConfirm(p.id)}>납부확인</button>}
              </div>
            ))}
          </>
        )}

        {tab === 'requests' && (
          <>
            {joinRequests.length === 0 && <p className="admin-empty">대기 중인 가입 신청이 없습니다</p>}
            {joinRequests.map(r => (
              <div key={r.id} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{r.member_nickname || '새 멤버'}</div>
                  <div className="admin-member-sub">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <div className="admin-request-actions">
                  <button className="admin-approve-btn" onClick={() => handleJoinAction(r.id, 'approve')}>수락</button>
                  <button className="admin-reject-btn" onClick={() => handleJoinAction(r.id, 'reject')}>거절</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
