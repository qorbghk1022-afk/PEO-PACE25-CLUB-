'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

const ADMIN_EMAILS = ['a5214275@naver.com'] // 관리자 이메일

interface MemberInfo {
  nickname: string; lv: number; total_dist: number; total_days: number;
  user_id: string | null; crew_id: string | null; is_active: boolean;
  leave_start: string | null; leave_end: string | null; leave_reason: string | null;
  lottery_tickets: number; remark: string | null; email?: string;
  strava?: boolean; crew_name?: string;
}

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [crews, setCrews] = useState<{ id: string; name: string; member_count: number; leader: string }[]>([])
  const [stats, setStats] = useState({ totalMembers: 0, totalCrews: 0, totalActivities: 0, totalDist: 0 })
  const [tab, setTab] = useState<'overview' | 'members' | 'crews' | 'activities'>('overview')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      if (!ADMIN_EMAILS.includes(session.user.email || '')) { window.location.href = '/'; return }
      setAuthorized(true)
      loadData()
    })
  }, [])

  async function loadData() {
    // 전체 멤버
    const { data: mems } = await supabase.from('members').select('*').order('lv', { ascending: false })
    const memsWithExtra = await Promise.all((mems || []).map(async (m) => {
      const strava = m.user_id ? !!(await supabase.from('strava_tokens').select('id').eq('user_id', m.user_id).maybeSingle()).data : false
      const crew = m.crew_id ? (await supabase.from('crews').select('name').eq('id', m.crew_id).maybeSingle()).data?.name : null
      return { ...m, strava, crew_name: crew } as MemberInfo
    }))
    setMembers(memsWithExtra)

    // 크루 목록
    const { data: crewList } = await supabase.from('crews').select('id, name, leader_user_id')
    const crewsWithCount = await Promise.all((crewList || []).map(async (c) => {
      const { count } = await supabase.from('crew_members').select('id', { count: 'exact', head: true }).eq('crew_id', c.id)
      const leader = (mems || []).find(m => m.user_id === c.leader_user_id)?.nickname || '-'
      return { id: c.id, name: c.name, member_count: count || 0, leader }
    }))
    setCrews(crewsWithCount)

    // 통계
    const { count: actCount } = await supabase.from('activities').select('id', { count: 'exact', head: true })
    const totalDist = (mems || []).reduce((s, m) => s + (m.total_dist || 0), 0)
    setStats({
      totalMembers: (mems || []).length,
      totalCrews: (crewList || []).length,
      totalActivities: actCount || 0,
      totalDist: Math.round(totalDist),
    })
    setLoading(false)
  }

  if (!authorized || loading) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="cs-back" onClick={() => { window.location.href = '/' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 className="admin-title">개발자 대시보드</h1>
        <div style={{ width: 40 }} />
      </header>

      {/* 통계 */}
      <div className="admin-summary">
        <div className="admin-summary-item"><span className="admin-summary-num">{stats.totalMembers}</span><span>전체 회원</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{stats.totalCrews}</span><span>크루</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{stats.totalActivities}</span><span>활동</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{stats.totalDist}km</span><span>총 거리</span></div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>전체</button>
        <button className={`admin-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>회원</button>
        <button className={`admin-tab ${tab === 'crews' ? 'active' : ''}`} onClick={() => setTab('crews')}>크루</button>
      </div>

      <div className="admin-body">
        {tab === 'overview' && (
          <div>
            <div className="admin-section-label">최근 가입</div>
            {members.filter(m => m.user_id).slice(0, 5).map(m => (
              <div key={m.nickname} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">
                    {m.nickname}
                    {m.user_id && <span className="admin-badge auth">가입</span>}
                    {m.strava && <span className="admin-badge strava">S</span>}
                    {m.leave_reason && <span className="admin-badge pending">{m.leave_reason}</span>}
                  </div>
                  <div className="admin-member-sub">LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km | {m.crew_name || '크루없음'}</div>
                </div>
              </div>
            ))}
            <div className="admin-section-label" style={{ marginTop: 16 }}>미연동 회원</div>
            {members.filter(m => !m.user_id).map(m => (
              <div key={m.nickname} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{m.nickname} <span className="admin-badge pending">미연동</span></div>
                  <div className="admin-member-sub">LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'members' && members.map(m => (
          <div key={m.nickname} className="admin-member-row">
            <div className="admin-member-info">
              <div className="admin-member-name">
                {m.nickname}
                {m.user_id && <span className="admin-badge auth">가입</span>}
                {m.strava && <span className="admin-badge strava">S</span>}
                {!m.user_id && <span className="admin-badge pending">미연동</span>}
                {m.leave_reason && <span className="admin-badge pending">{m.leave_reason}</span>}
              </div>
              <div className="admin-member-sub">
                LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km | {m.total_days}일 | 티켓:{m.lottery_tickets}
                {m.crew_name && ` | ${m.crew_name}`}
                {m.remark && <span className="admin-remark"> | {m.remark}</span>}
              </div>
            </div>
          </div>
        ))}

        {tab === 'crews' && crews.map(c => (
          <div key={c.id} style={{ marginBottom: 16 }}>
            <div className="admin-member-row" style={{ background: '#f5f5f5', borderRadius: 8, padding: '10px 12px' }}>
              <div className="admin-member-info">
                <div className="admin-member-name">{c.name}</div>
                <div className="admin-member-sub">크루장: {c.leader} | {c.member_count}명</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="admin-approve-btn" onClick={() => {
                  localStorage.setItem('peo_active_crew', c.id)
                  window.location.href = '/'
                }}>접속</button>
                <button className="admin-kick-btn" onClick={async () => {
                  if (!confirm(`"${c.name}" 크루를 삭제할까요?\n멤버 ${c.member_count}명의 크루 연결이 해제됩니다.`)) return
                  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
                  await supabase.from('crew_members').delete().eq('crew_id', c.id)
                  await supabase.from('members').update({ crew_id: null }).eq('crew_id', c.id)
                  await supabase.from('challenge_teams').delete().in('challenge_id',
                    (await supabase.from('challenges').select('id').eq('crew_id', c.id)).data?.map(ch => ch.id) || [])
                  await supabase.from('challenges').delete().eq('crew_id', c.id)
                  await supabase.from('seasons').delete().eq('crew_id', c.id)
                  await supabase.from('crew_join_requests').delete().eq('crew_id', c.id)
                  await supabase.from('crews').delete().eq('id', c.id)
                  setCrews(prev => prev.filter(x => x.id !== c.id))
                  alert(`"${c.name}" 크루가 삭제되었습니다.`)
                }}>삭제</button>
              </div>
            </div>
            {members.filter(m => m.crew_name === c.name).map(m => (
              <div key={m.nickname} className="admin-member-row" style={{ paddingLeft: 20 }}>
                <div className="admin-member-info">
                  <div className="admin-member-name" style={{ fontSize: 13 }}>
                    {m.nickname}
                    {m.user_id && <span className="admin-badge auth">가입</span>}
                    {m.strava && <span className="admin-badge strava">S</span>}
                    {!m.user_id && <span className="admin-badge pending">미연동</span>}
                  </div>
                  <div className="admin-member-sub">LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
