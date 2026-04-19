'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

const ADMIN_EMAILS = ['a5214275@naver.com']

type TabKey = 'members' | 'leaves' | 'payments' | 'requests' | 'challenges' | 'draw'
interface CrewOption { id: string; name: string; member_count: number }

interface MemberInfo {
  id: string; nickname: string; realname: string | null; lv: number; total_dist: number;
  total_days: number; user_id: string | null; crew_id: string | null; is_active: boolean;
  leave_start: string | null; leave_end: string | null; leave_reason: string | null;
  lottery_tickets: number; remark: string | null; email?: string;
  strava: boolean; total_exp: number;
}
interface MemberDetail {
  nickname: string;
  crews: Array<{ id: string; name: string }>;
  strava_connected: boolean;
  real_name: string | null; phone: string | null; email: string | null;
  joined_at: string | null; lv: number; total_dist: number; total_days: number;
  lottery_tickets: number; remark: string | null;
  leave_start: string | null; leave_end: string | null; leave_reason: string | null;
  linked: boolean; masked: boolean;
  current_crew_id: string | null;
}
interface LeaveRow { id: string; member_nickname: string; challenge_id: string; reason: string; reason_detail: string | null; status: string; requested_at: string }
interface PaymentRow { id: string; member_nickname: string; type: string; amount: number; status: string; month?: string; season_id?: string; created_at: string; paid_at: string | null }
interface JoinReqRow { id: string; member_nickname: string | null; user_id: string; created_at: string; status: string }
interface ChallengeRow { id: string; season_id: string; goal_km: number; fine_per_km: number; start_date: string; end_date: string }
interface ChallengeTeamRow { id: string; challenge_id: string; team_num: number; member_nickname: string }
interface DrawResult { id: string; quarter: string; rank: number; prize: string; winner_nickname: string; ticket_count: number }
interface SeasonRow { id: string; generation: number; start_date: string; end_date: string; is_current: boolean }

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('members')
  const [crews, setCrews] = useState<CrewOption[]>([])
  const [selectedCrewId, setSelectedCrewId] = useState<string>('')

  // Data states
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinReqRow[]>([])
  const [processedRequests, setProcessedRequests] = useState<JoinReqRow[]>([])
  const [challenges, setChallenges] = useState<ChallengeRow[]>([])
  const [challengeTeams, setChallengeTeams] = useState<ChallengeTeamRow[]>([])
  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [drawResults, setDrawResults] = useState<DrawResult[]>([])

  // Members tab state
  const [memberSearch, setMemberSearch] = useState('')
  const [memberFilter, setMemberFilter] = useState('전체')
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  // Payments tab state
  const [payMonth, setPayMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [payTypeFilter, setPayTypeFilter] = useState('전체')
  const [payStatusFilter, setPayStatusFilter] = useState('전체')

  // Challenges tab state
  const [newChStart, setNewChStart] = useState('')
  const [newChEnd, setNewChEnd] = useState('')
  const [newChGoal, setNewChGoal] = useState('15')

  // Draw tab state
  const [drawQuarter, setDrawQuarter] = useState(() => { const d = new Date(); const q = Math.ceil((d.getMonth() + 1) / 3); return `Q${q}-${d.getFullYear()}` })
  const [newQuarterName, setNewQuarterName] = useState('')

  // Modal states
  const [manualModal, setManualModal] = useState<string | null>(null)
  const [manualDate, setManualDate] = useState('')
  const [manualDist, setManualDist] = useState('')
  const [manualTime, setManualTime] = useState('')
  const [manualPace, setManualPace] = useState('')
  const [detailModal, setDetailModal] = useState<MemberDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [memberActivities, setMemberActivities] = useState<{ date: string; distance_km: number; avg_pace_sec: number }[]>([])

  // Auth check + load crews
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      if (!ADMIN_EMAILS.includes(session.user.email || '')) { window.location.href = '/'; return }
      setAuthorized(true)
      // 크루 목록
      const { data: crewList } = await supabase.from('crews').select('id, name')
      const crewsWithCount = await Promise.all((crewList || []).map(async c => {
        const { count } = await supabase.from('crew_members').select('id', { count: 'exact', head: true }).eq('crew_id', c.id)
        return { ...c, member_count: count || 0 }
      }))
      setCrews(crewsWithCount)
      if (crewsWithCount.length > 0) setSelectedCrewId(crewsWithCount[0].id)
    })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [
      { data: mems },
      { data: stravaTokens },
      { data: lvs },
      { data: pays },
      { data: pendingReqs },
      { data: processedReqs },
      { data: challs },
      { data: teams },
      { data: seasonsData },
      { data: draws },
    ] = await Promise.all([
      supabase.from('members').select('*').order('lv', { ascending: false }),
      supabase.from('strava_tokens').select('user_id'),
      supabase.from('challenge_leaves').select('*').order('requested_at', { ascending: false }),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('crew_join_requests').select('*').eq('crew_id', selectedCrewId).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('crew_join_requests').select('*').eq('crew_id', selectedCrewId).in('status', ['approved', 'rejected']).order('created_at', { ascending: false }).limit(20),
      supabase.from('challenges').select('*').eq('crew_id', selectedCrewId).order('start_date', { ascending: false }),
      supabase.from('challenge_teams').select('*'),
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
      supabase.from('draw_results').select('*').order('quarter', { ascending: false }).order('rank'),
    ])

    const stravaSet = new Set((stravaTokens || []).map(t => t.user_id))
    // 전체 모드면 필터 없이, 크루 선택 시 crew_id 기준 엄격 필터
    // (과거엔 crew_members junction OR filter로 불일치 데이터를 보완했으나,
    //  다중 크루 스키마에서는 같은 사람이 2 row에 걸쳐 중복 표시되는 버그 발생.
    //  체크박스가 유일한 진실의 원천 — members.crew_id만 사용)
    let filteredMems = mems || []
    if (selectedCrewId !== 'all') {
      filteredMems = (mems || []).filter(m => m.crew_id === selectedCrewId)
    }
    const memsWithExtra = filteredMems.map(m => ({
      ...m,
      strava: m.user_id ? stravaSet.has(m.user_id) : false,
    })) as MemberInfo[]
    setMembers(memsWithExtra)
    setLeaves((lvs || []) as LeaveRow[])
    setPayments((pays || []) as PaymentRow[])
    setJoinRequests((pendingReqs || []) as JoinReqRow[])
    setProcessedRequests((processedReqs || []) as JoinReqRow[])
    setChallenges((challs || []) as ChallengeRow[])
    setChallengeTeams((teams || []) as ChallengeTeamRow[])
    setSeasons((seasonsData || []) as SeasonRow[])
    setDrawResults((draws || []) as DrawResult[])
    setLoading(false)
  }, [selectedCrewId])

  useEffect(() => { if (authorized && selectedCrewId) loadData() }, [authorized, selectedCrewId, loadData])
  // "전체" 선택 시에도 로드
  useEffect(() => { if (authorized && selectedCrewId === 'all') loadData() }, [authorized])

  // 추첨 탭 진입 시 자동 동기화
  useEffect(() => { if (tab === 'draw' && members.length > 0) syncTickets() }, [tab])

  // ---- Handlers ----

  async function handleKick(nickname: string) {
    if (!confirm(`${nickname}님을 정말 강퇴할까요?`)) return
    if (!confirm('이 작업은 되돌릴 수 없습니다.')) return
    await fetchWithAuth('/api/crew/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kick', nickname })
    })
    setMembers(prev => prev.filter(m => m.nickname !== nickname))
  }

  async function handleRemarkSave(nickname: string) {
    const r = prompt('비고:', members.find(m => m.nickname === nickname)?.remark || '')
    if (r === null) return
    await fetchWithAuth('/api/crew/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_remark', nickname, remark: r })
    })
    setMembers(prev => prev.map(m => m.nickname === nickname ? { ...m, remark: r } : m))
  }

  async function handleManualActivity() {
    if (!manualModal || !manualDate || !manualDist) { alert('날짜와 거리는 필수입니다'); return }
    const distKm = parseFloat(manualDist)
    const timeSec = manualTime ? parseDuration(manualTime) : 0
    const paceSec = manualPace ? parsePace(manualPace) : (timeSec && distKm ? Math.round(timeSec / distKm) : 0)
    // 수동입력은 선택된 크루 기준 (전체 모드면 해당 회원의 첫 크루)
    const targetMember = members.find(x => x.nickname === manualModal)
    const manualCrewId = selectedCrewId !== 'all' ? selectedCrewId : (targetMember?.crew_id || null)
    await supabase.from('activities').insert({
      member_nickname: manualModal,
      date: manualDate,
      distance_km: distKm,
      moving_time_sec: timeSec,
      elapsed_time_sec: timeSec,
      avg_pace_sec: paceSec,
      efficiency: timeSec > 0 ? parseFloat((timeSec / (timeSec * 1.05)).toFixed(4)) : 1,
      sport_type: 'Run',
      activity_name: '수동 입력',
      crew_id: manualCrewId,
    })
    alert(`${manualModal}님의 활동이 추가되었습니다`)
    setManualModal(null)
    setManualDate(''); setManualDist(''); setManualTime(''); setManualPace('')
  }

  async function loadMemberDetail(m: MemberInfo) {
    setDetailModal(null)
    setMemberActivities([])
    setDetailLoading(true)
    try {
      const qs = new URLSearchParams({ nickname: m.nickname })
      if (m.crew_id) qs.set('crew_id', m.crew_id)
      const res = await fetchWithAuth(`/api/admin/member-detail?${qs.toString()}`)
      if (!res.ok) { alert('상세 정보 로드 실패: ' + (await res.json()).error); return }
      setDetailModal(await res.json() as MemberDetail)
      const { data } = await supabase.from('activities').select('date, distance_km, avg_pace_sec')
        .eq('member_nickname', m.nickname).order('date', { ascending: false }).limit(10)
      setMemberActivities(data || [])
    } finally {
      setDetailLoading(false)
    }
  }

  async function toggleUnmask() {
    if (!detailModal || !detailModal.linked) return
    const willUnmask = detailModal.masked
    if (willUnmask && !confirm('개인정보를 평문으로 표시합니다. 계속할까요?')) return
    const qs = new URLSearchParams({ nickname: detailModal.nickname, unmask: willUnmask ? '1' : '0' })
    if (detailModal.current_crew_id) qs.set('crew_id', detailModal.current_crew_id)
    const res = await fetchWithAuth(`/api/admin/member-detail?${qs.toString()}`)
    if (!res.ok) { alert('로드 실패'); return }
    setDetailModal(await res.json() as MemberDetail)
  }

  async function toggleCrewMembership(crewId: string) {
    if (!detailModal) return
    const joined = detailModal.crews.some(c => c.id === crewId)
    const crewName = crews.find(c => c.id === crewId)?.name ?? crewId
    if (!joined) {
      if (!confirm(`${detailModal.nickname}님을 "${crewName}" 크루에 추가할까요?`)) return
    } else {
      if (detailModal.crews.length <= 1) { alert('최소 1개 크루는 유지해야 합니다'); return }
      if (!confirm(`${detailModal.nickname}님을 "${crewName}" 크루에서 제거할까요? 해당 크루의 추첨권/휴식 정보는 삭제됩니다.`)) return
    }
    const res = await fetchWithAuth('/api/admin/member-crew', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: joined ? 'remove' : 'add', nickname: detailModal.nickname, crew_id: crewId }),
    })
    if (!res.ok) { alert('실패: ' + (await res.json()).error); return }
    // 리로드
    const qs = new URLSearchParams({ nickname: detailModal.nickname })
    if (detailModal.current_crew_id) qs.set('crew_id', detailModal.current_crew_id)
    const detailRes = await fetchWithAuth(`/api/admin/member-detail?${qs.toString()}`)
    if (detailRes.ok) setDetailModal(await detailRes.json() as MemberDetail)
    loadData()
  }

  function copyMemberInfo() {
    if (!detailModal) return
    const text = `${detailModal.nickname}\t${detailModal.real_name || ''}`
    navigator.clipboard.writeText(text).then(
      () => alert('복사되었습니다 (닉네임 + 실명)'),
      () => alert('복사 실패'),
    )
  }

  // Leave handlers
  async function handleLeaveAction(leaveId: string, action: 'approve' | 'reject') {
    await fetchWithAuth('/api/challenge/leave', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveId, action })
    })
    setLeaves(prev => prev.map(l => l.id === leaveId ? { ...l, status: action === 'approve' ? 'approved' : 'rejected' } : l))
  }

  async function handleClearLeave(nickname: string) {
    await fetchWithAuth('/api/crew/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_leave', nickname })
    })
    setMembers(prev => prev.map(m => m.nickname === nickname ? { ...m, leave_start: null, leave_end: null, leave_reason: null } : m))
  }

  async function handleSetLeave() {
    const nick = (document.getElementById('adm-leave-member') as HTMLSelectElement)?.value
    const reason = (document.getElementById('adm-leave-reason') as HTMLSelectElement)?.value
    const start = (document.getElementById('adm-leave-start') as HTMLInputElement)?.value
    const end = (document.getElementById('adm-leave-end') as HTMLInputElement)?.value
    if (!nick || !start || !end) { alert('모든 항목을 입력해주세요'); return }
    await fetchWithAuth('/api/crew/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_leave', nickname: nick, leave_start: start, leave_end: end, leave_reason: reason })
    })
    setMembers(prev => prev.map(m => m.nickname === nick ? { ...m, leave_start: start, leave_end: end, leave_reason: reason } : m))
    alert(`${nick}님 휴식 설정 완료`)
  }

  // Payment handlers
  async function handlePaymentConfirm(paymentId: string) {
    await fetchWithAuth('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_payment', payment_id: paymentId, status: 'paid' })
    })
    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'paid' } : p))
  }

  async function handleBulkCreateFees() {
    if (!confirm(`${payMonth} 회비를 일괄 생성할까요? (₩5,000/인)`)) return
    const activeMembers = members.filter(m => m.is_active && m.user_id)
    const rows = activeMembers.map(m => ({
      member_nickname: m.nickname, type: '회비', amount: 5000, status: 'unpaid', month: payMonth
    }))
    const res = await fetchWithAuth('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_fines', fines: rows })
    })
    if (!res.ok) { alert('오류: ' + (await res.json()).error); return }
    alert(`${activeMembers.length}명 회비 생성 완료`)
    loadData()
  }

  async function handleAutoCreateFines() {
    if (!confirm('현재 시즌 벌금을 자동 생성할까요?')) return
    const currentChallenge = challenges.find(c => c.end_date >= new Date().toISOString().slice(0, 10) && c.start_date <= new Date().toISOString().slice(0, 10))
    if (!currentChallenge) { alert('진행 중인 챌린지가 없습니다'); return }
    const teams = challengeTeams.filter(t => t.challenge_id === currentChallenge.id)
    const teamNums = [...new Set(teams.map(t => t.team_num))]
    const fineRows: { member_nickname: string; type: string; amount: number; status: string; season_id: string }[] = []
    for (const tn of teamNums) {
      const teamMembers = teams.filter(t => t.team_num === tn)
      const onLeave = members.filter(m => m.leave_start && m.leave_end && m.leave_end >= currentChallenge.start_date)
      const activeTeam = teamMembers.filter(t => !onLeave.find(l => l.nickname === t.member_nickname))
      const goalTotal = Number(currentChallenge.goal_km) * activeTeam.length
      let teamDist = 0
      for (const tm of activeTeam) {
        const { data } = await supabase.from('activities').select('distance_km')
          .eq('member_nickname', tm.member_nickname)
          .gte('date', currentChallenge.start_date).lte('date', currentChallenge.end_date)
        teamDist += (data || []).reduce((s, a) => s + Number(a.distance_km || 0), 0)
      }
      const shortfall = Math.max(0, Math.ceil(goalTotal - teamDist))
      if (shortfall > 0) {
        const fineTotal = shortfall * Number(currentChallenge.fine_per_km)
        const perPerson = Math.round(fineTotal / activeTeam.length)
        activeTeam.forEach(tm => {
          fineRows.push({ member_nickname: tm.member_nickname, type: '벌금', amount: perPerson, status: 'unpaid', season_id: currentChallenge.season_id })
        })
      }
    }
    if (fineRows.length === 0) { alert('벌금 대상이 없습니다'); return }
    const res = await fetchWithAuth('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_fines', fines: fineRows })
    })
    if (!res.ok) { alert('벌금 생성 실패: ' + (await res.json()).error); return }
    alert(`벌금 ${fineRows.length}건 생성 완료`)
    loadData()
  }

  // Join request handlers
  async function handleJoinAction(requestId: string, action: 'approve' | 'reject') {
    await fetchWithAuth('/api/crew/handle-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action })
    })
    const moved = joinRequests.find(r => r.id === requestId)
    setJoinRequests(prev => prev.filter(r => r.id !== requestId))
    if (moved) setProcessedRequests(prev => [{ ...moved, status: action === 'approve' ? 'approved' : 'rejected' }, ...prev])
  }

  // Challenge handlers
  async function handleCreateChallenge() {
    if (!newChStart || !newChEnd) { alert('시작일과 종료일을 입력해주세요'); return }
    const currentSeason = seasons.find(s => s.is_current)
    const { error } = await supabase.from('challenges').insert({
      season_id: currentSeason?.id || null,
      goal_km: parseFloat(newChGoal),
      fine_per_km: 3000,
      start_date: newChStart,
      end_date: newChEnd,
    })
    if (error) { alert('오류: ' + error.message); return }
    alert('챌린지 생성 완료')
    setNewChStart(''); setNewChEnd(''); setNewChGoal('15')
    loadData()
  }

  async function handleEndChallenge(challengeId: string) {
    if (!confirm('이 챌린지를 종료할까요?')) return
    await supabase.from('challenges').update({ end_date: new Date().toISOString().slice(0, 10) }).eq('id', challengeId)
    loadData()
  }

  async function handleReformTeams(challengeId: string) {
    if (!confirm('팀을 재구성할까요? 기존 팀 배정이 초기화됩니다.')) return
    await supabase.from('challenge_teams').delete().eq('challenge_id', challengeId)
    const activeMembers = members.filter(m => m.is_active && m.user_id && !(m.leave_start && m.leave_end && m.leave_end >= new Date().toISOString().slice(0, 10)))
    const shuffled = [...activeMembers].sort(() => Math.random() - 0.5)
    const teamSize = Math.ceil(shuffled.length / Math.ceil(shuffled.length / 4))
    const rows = shuffled.map((m, i) => ({
      challenge_id: challengeId,
      team_num: Math.floor(i / teamSize) + 1,
      member_nickname: m.nickname,
    }))
    await supabase.from('challenge_teams').insert(rows)
    alert(`${Math.ceil(shuffled.length / teamSize)}개 팀으로 재구성 완료`)
    loadData()
  }

  // 추첨권 동기화 (활동 기반 실시간 계산 → DB 반영)
  async function syncTickets() {
    const challengeDates = [
      { start: '2026-01-26', end: '2026-02-08' },
      { start: '2026-02-09', end: '2026-02-22' },
      { start: '2026-02-23', end: '2026-03-08' },
      { start: '2026-03-09', end: '2026-03-22' },
      { start: '2026-03-23', end: '2026-04-05' },
      { start: '2026-04-06', end: '2026-04-19' },
    ]
    const sessionDates = ['2026-02-21', '2026-03-21', '2026-04-18']

    const res = await fetchWithAuth('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_tickets', crew_id: selectedCrewId, challenge_dates: challengeDates, session_dates: sessionDates })
    })
    if (res.ok) {
      const { results } = await res.json()
      if (results) {
        setMembers(prev => prev.map(m => {
          const r = results.find((x: { nickname: string; tickets: number }) => x.nickname === m.nickname)
          return r ? { ...m, lottery_tickets: r.tickets } : m
        }))
      }
    }
  }

  // Draw handlers
  async function handleDraw() {
    if (!confirm(`${drawQuarter} 추첨을 시작할까요?`)) return
    const res = await fetchWithAuth('/api/draw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarter: drawQuarter })
    })
    const data = await res.json()
    if (data.results) {
      setDrawResults(prev => [...data.results, ...prev.filter(r => r.quarter !== drawQuarter)])
      alert('추첨 완료!')
    } else {
      alert(data.error || '추첨 실패')
    }
  }

  async function handleCreateQuarter() {
    if (!newQuarterName) { alert('분기 이름을 입력해주세요 (예: Q2-2026)'); return }
    setDrawQuarter(newQuarterName)
    setNewQuarterName('')
    alert(`분기 ${newQuarterName} 설정 완료`)
  }

  // Helpers
  function parseDuration(s: string): number {
    const parts = s.split(':').map(Number)
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return 0
  }
  function parsePace(s: string): number {
    const parts = s.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return 0
  }
  function formatPace(sec: number): string {
    if (!sec) return '-'
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}'${String(s).padStart(2, '0')}"`
  }
  function dDay(dateStr: string): string {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : `D+${Math.abs(diff)}`
  }
  function daysSince(dateStr: string): number {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  }

  // Filtered data
  const filteredMembers = members.filter(m => {
    if (memberSearch && !m.nickname.toLowerCase().includes(memberSearch.toLowerCase())) return false
    switch (memberFilter) {
      case '가입완료': return !!m.user_id
      case '미연동': return !m.user_id
      case 'Strava연결': return m.strava
      case '휴식중': return !!(m.leave_start && m.leave_end && m.leave_end >= new Date().toISOString().slice(0, 10))
      default: return true
    }
  })

  const filteredPayments = payments.filter(p => {
    if (payMonth && p.month && !p.month.startsWith(payMonth) && p.type === '회비') return false
    if (payTypeFilter !== '전체' && p.type !== payTypeFilter) return false
    if (payStatusFilter === '미납' && p.status !== 'unpaid') return false
    if (payStatusFilter === '완료' && p.status !== 'paid') return false
    return true
  })

  const today = new Date().toISOString().slice(0, 10)
  const currentChallenge = challenges.find(c => c.start_date <= today && c.end_date >= today)
  const pastChallenges = challenges.filter(c => c.end_date < today)
  const pendingLeaves = leaves.filter(l => l.status === 'pending')
  const restingMembers = members.filter(m => m.leave_start && m.leave_end && m.leave_end >= today)
  const unpaidPayments = payments.filter(p => p.status === 'unpaid')
  const currentDrawResults = drawResults.filter(r => r.quarter === drawQuarter)
  const pastDrawQuarters = [...new Set(drawResults.map(r => r.quarter))].filter(q => q !== drawQuarter)

  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/crew/join/${selectedCrewId}` : ''

  if (!authorized || loading) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>

  // Stats
  const totalMembers = members.length
  const authCount = members.filter(m => m.user_id).length
  const stravaCount = members.filter(m => m.strava).length
  const totalDist = Math.round(members.reduce((s, m) => s + (m.total_dist || 0), 0))

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="cs-back" onClick={() => { window.location.href = '/' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 className="admin-title">관리자</h1>
        <div style={{ width: 40 }} />
      </header>

      {/* 크루 선택 */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center' }}>
        <button onClick={() => setSelectedCrewId('all')} style={{
          padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          background: selectedCrewId === 'all' ? '#111' : '#f0f0f0',
          color: selectedCrewId === 'all' ? '#fff' : '#666',
        }}>전체</button>
        {crews.map(c => (
          <button key={c.id} onClick={() => setSelectedCrewId(c.id)} style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            background: selectedCrewId === c.id ? '#A51C30' : '#f0f0f0',
            color: selectedCrewId === c.id ? '#fff' : '#666',
          }}>
            {c.name} ({c.member_count})
          </button>
        ))}
        {selectedCrewId !== 'all' && <button style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #e53935', background: 'none', color: '#e53935', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
          onClick={async () => {
            const crew = crews.find(c => c.id === selectedCrewId)
            if (!crew) return
            if (!confirm(`"${crew.name}" 크루를 삭제할까요? (${crew.member_count}명)`)) return
            if (!confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return
            const res = await fetchWithAuth('/api/admin', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'delete_crew', crew_id: selectedCrewId })
            })
            if (!res.ok) { alert('삭제 실패: ' + (await res.json()).error); return }
            setCrews(prev => prev.filter(c => c.id !== selectedCrewId))
            if (crews.length > 1) setSelectedCrewId(crews.find(c => c.id !== selectedCrewId)?.id || '')
            alert('크루가 삭제되었습니다.')
          }}>삭제</button>}
      </div>

      <div className="admin-summary">
        <div className="admin-summary-item"><span className="admin-summary-num">{totalMembers}</span><span>전체</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{authCount}</span><span>가입</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{stravaCount}</span><span>Strava</span></div>
        <div className="admin-summary-item"><span className="admin-summary-num">{totalDist}km</span><span>총 거리</span></div>
      </div>

      <div className="admin-tabs" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {([
          ['members', '회원'], ['leaves', '중단'], ['payments', '납부'],
          ['requests', '가입'], ['challenges', '챌린지'], ['draw', '추첨'],
        ] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} className={`admin-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div className="admin-body">

        {/* ========== TAB 1: 회원 ========== */}
        {tab === 'members' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text" placeholder="닉네임 검색" value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'Pretendard, sans-serif' }}
              />
              <select
                value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif', background: '#fff' }}
              >
                {['전체', '가입완료', '미연동', 'Strava연결', '휴식중'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
              {filteredMembers.length}명 표시
            </div>

            {filteredMembers.map(m => {
              const isExpanded = expandedMember === m.nickname
              const isResting = !!(m.leave_start && m.leave_end && m.leave_end >= today)
              const memberPayments = payments.filter(p => p.member_nickname === m.nickname)
              const unpaidFees = memberPayments.filter(p => p.status === 'unpaid' && p.type === '회비')
              const unpaidFines = memberPayments.filter(p => p.status === 'unpaid' && p.type === '벌금')

              return (
                <div key={m.nickname} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <div
                    className="admin-member-row"
                    style={{ cursor: 'pointer', borderBottom: 'none' }}
                    onClick={() => setExpandedMember(isExpanded ? null : m.nickname)}
                  >
                    <div className="admin-member-info">
                      <div className="admin-member-name">
                        {m.nickname}
                        {m.user_id && <span className="admin-badge auth">가입</span>}
                        {!m.user_id && <span className="admin-badge pending">미연동</span>}
                        {m.strava && <span className="admin-badge strava">S</span>}
                        {isResting && <span className="admin-badge" style={{ background: '#e3f2fd', color: '#1565c0' }}>휴식</span>}
                      </div>
                      <div className="admin-member-sub">
                        {selectedCrewId === 'all' && <span style={{ color: '#A51C30', marginRight: 4 }}>{crews.find(c => c.id === m.crew_id)?.name || '크루없음'}</span>}
                        LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km
                        {m.remark && <span className="admin-remark"> | {m.remark}</span>}
                      </div>
                    </div>
                    <div className="admin-member-actions" onClick={e => e.stopPropagation()}>
                      <button className="admin-sm-btn" onClick={() => handleRemarkSave(m.nickname)}>비고</button>
                      <button className="admin-kick-btn" onClick={() => handleKick(m.nickname)}>강퇴</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', fontSize: 12, color: '#666' }}>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span>회비 미납: <b style={{ color: unpaidFees.length ? '#e53935' : '#2e7d32' }}>{unpaidFees.length}건</b></span>
                        <span>벌금 미납: <b style={{ color: unpaidFines.length ? '#e53935' : '#2e7d32' }}>{unpaidFines.length}건</b></span>
                        <span>추첨권: <b>{m.lottery_tickets}장</b></span>
                        <span>총 활동일: <b>{m.total_days}일</b></span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="admin-sm-btn" onClick={() => { setManualModal(m.nickname) }}>수동입력</button>
                        <button className="admin-sm-btn" onClick={() => loadMemberDetail(m)}>상세</button>
                        {!m.user_id && (
                          <button className="admin-sm-btn" style={{ color: '#1565c0', borderColor: '#1565c0' }}
                            onClick={() => { navigator.clipboard.writeText(inviteLink); alert('초대 링크가 복사되었습니다') }}>초대</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {filteredMembers.length === 0 && <p className="admin-empty">조건에 맞는 회원이 없습니다</p>}
          </>
        )}

        {/* ========== TAB 2: 중단 ========== */}
        {tab === 'leaves' && (
          <>
            <div className="admin-section-label">대기 중인 중단 신청</div>
            {pendingLeaves.length === 0 && <p className="admin-empty-sm">대기 중인 중단 신청이 없습니다</p>}
            {pendingLeaves.map(l => {
              const ch = challenges.find(c => c.id === l.challenge_id)
              const dPlus = ch ? daysSince(ch.start_date) : 0
              return (
                <div key={l.id} className="admin-member-row">
                  <div className="admin-member-info">
                    <div className="admin-member-name">
                      {l.member_nickname}
                      <span className="admin-badge" style={{ background: '#fff3e0', color: '#e65100' }}>D+{dPlus}</span>
                    </div>
                    <div className="admin-member-sub">
                      {l.reason}{l.reason_detail ? ` - ${l.reason_detail}` : ''} | {new Date(l.requested_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="admin-request-actions">
                    <button className="admin-approve-btn" onClick={() => handleLeaveAction(l.id, 'approve')}>수락</button>
                    <button className="admin-reject-btn" onClick={() => handleLeaveAction(l.id, 'reject')}>거절</button>
                  </div>
                </div>
              )
            })}

            <div className="admin-section-label" style={{ marginTop: 16 }}>휴식 중인 멤버</div>
            {restingMembers.length === 0 && <p className="admin-empty-sm">휴식 중인 멤버가 없습니다</p>}
            {restingMembers.map(m => (
              <div key={m.nickname} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{m.nickname} <span className="admin-badge strava">{m.leave_reason}</span></div>
                  <div className="admin-member-sub">{m.leave_start} ~ {m.leave_end}</div>
                </div>
                <button className="admin-sm-btn" onClick={() => { handleClearLeave(m.nickname); alert(`${m.nickname}님 휴식 해제 완료`) }}>해제</button>
              </div>
            ))}

            <div className="admin-section-label" style={{ marginTop: 16 }}>휴식 설정</div>
            <div className="admin-leave-form">
              <select id="adm-leave-member" className="myinfo-select">
                <option value="">멤버 선택</option>
                {members.filter(m => !m.leave_start).map(m => <option key={m.nickname} value={m.nickname}>{m.nickname}</option>)}
              </select>
              <select id="adm-leave-reason" className="myinfo-select">
                <option value="병가">병가</option>
                <option value="출산휴가">출산휴가</option>
                <option value="기타">기타</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" id="adm-leave-start" className="myinfo-input" />
                <span style={{ lineHeight: '40px' }}>~</span>
                <input type="date" id="adm-leave-end" className="myinfo-input" />
              </div>
              <button className="admin-approve-btn" onClick={handleSetLeave}>휴식 설정</button>
            </div>
          </>
        )}

        {/* ========== TAB 3: 납부 ========== */}
        {tab === 'payments' && (
          <>
            {unpaidPayments.length > 0 && (
              <div className="admin-unpaid-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>미납 {unpaidPayments.length}건 | ₩{unpaidPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</span>
                <button className="admin-sm-btn" style={{ color: '#e65100', borderColor: '#e65100' }}
                  onClick={() => alert('미납자 전체 알림 기능 준비 중')}>미납자 전체 알림</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
              <input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif' }} />
              <select value={payTypeFilter} onChange={e => setPayTypeFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif', background: '#fff' }}>
                <option value="전체">유형: 전체</option>
                <option value="회비">회비</option>
                <option value="벌금">벌금</option>
              </select>
              <select value={payStatusFilter} onChange={e => setPayStatusFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif', background: '#fff' }}>
                <option value="전체">상태: 전체</option>
                <option value="미납">미납</option>
                <option value="완료">완료</option>
              </select>
            </div>

            {filteredPayments.length === 0 && <p className="admin-empty">납부 내역이 없습니다</p>}
            {filteredPayments.map(p => (
              <div key={p.id} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">
                    {p.member_nickname}
                    <span className="admin-badge" style={{
                      background: p.status === 'paid' ? '#e8f5e9' : '#ffebee',
                      color: p.status === 'paid' ? '#2e7d32' : '#c62828'
                    }}>{p.status === 'paid' ? '완료' : '미납'}</span>
                  </div>
                  <div className="admin-member-sub">
                    {p.type} | ₩{p.amount.toLocaleString()}{p.month ? ` | ${p.month}` : ''}
                    {p.paid_at ? ` | ${new Date(p.paid_at).toLocaleDateString()} 납부` : ''}
                  </div>
                </div>
                {p.status === 'unpaid' && (
                  <button className="admin-approve-btn" onClick={() => handlePaymentConfirm(p.id)}>납부 확인</button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="admin-action-btn" style={{ flex: 1 }} onClick={handleBulkCreateFees}>회비 일괄 생성</button>
              <button className="admin-action-btn" style={{ flex: 1 }} onClick={handleAutoCreateFines}>벌금 자동 생성</button>
            </div>
          </>
        )}

        {/* ========== TAB 4: 가입 ========== */}
        {tab === 'requests' && (
          <>
            <div className="admin-section-label">대기 중인 가입 신청</div>
            {joinRequests.length === 0 && <p className="admin-empty-sm">대기 중인 가입 신청이 없습니다</p>}
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

            <div className="admin-section-label" style={{ marginTop: 16 }}>크루 초대 링크</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="text" readOnly value={inviteLink}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 11, color: '#666', fontFamily: 'Pretendard, sans-serif' }} />
              <button className="admin-approve-btn" onClick={() => { navigator.clipboard.writeText(inviteLink); alert('복사되었습니다') }}>복사</button>
            </div>

            <div className="admin-section-label" style={{ marginTop: 20 }}>처리 내역</div>
            {processedRequests.length === 0 && <p className="admin-empty-sm">처리된 내역이 없습니다</p>}
            {processedRequests.map(r => (
              <div key={r.id} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">
                    {r.member_nickname || '멤버'}
                    <span className="admin-badge" style={{
                      background: r.status === 'approved' ? '#e8f5e9' : '#ffebee',
                      color: r.status === 'approved' ? '#2e7d32' : '#c62828'
                    }}>{r.status === 'approved' ? '수락' : '거절'}</span>
                  </div>
                  <div className="admin-member-sub">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ========== TAB 5: 챌린지 ========== */}
        {tab === 'challenges' && (
          <>
            <div className="admin-section-label">현재 챌린지</div>
            {currentChallenge ? (() => {
              const ch = currentChallenge
              const chTeams = challengeTeams.filter(t => t.challenge_id === ch.id)
              const teamNums = [...new Set(chTeams.map(t => t.team_num))].sort((a, b) => a - b)
              const season = seasons.find(s => s.id === ch.season_id)
              return (
                <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                    {season ? `시즌 ${season.generation}` : '시즌 -'} | 목표 {ch.goal_km}km/인
                    <span style={{ float: 'right', color: '#A51C30', fontWeight: 700 }}>{dDay(ch.end_date)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>{ch.start_date} ~ {ch.end_date}</div>
                  {teamNums.map(tn => {
                    const teamMems = chTeams.filter(t => t.team_num === tn)
                    return (
                      <div key={tn} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>팀 {tn} ({teamMems.length}명)</div>
                        <div style={{ fontSize: 11, color: '#888', paddingLeft: 8 }}>{teamMems.map(t => t.member_nickname).join(', ')}</div>
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="admin-sm-btn" onClick={() => handleReformTeams(ch.id)}>팀 재구성</button>
                    <button className="admin-kick-btn" onClick={() => handleEndChallenge(ch.id)}>종료</button>
                  </div>
                </div>
              )
            })() : <p className="admin-empty-sm">진행 중인 챌린지가 없습니다</p>}

            <div className="admin-section-label" style={{ marginTop: 16 }}>챌린지 수동 생성</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={newChStart} onChange={e => setNewChStart(e.target.value)}
                  placeholder="시작일" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif' }} />
                <input type="date" value={newChEnd} onChange={e => setNewChEnd(e.target.value)}
                  placeholder="종료일" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={newChGoal} onChange={e => setNewChGoal(e.target.value)}
                  placeholder="목표 km" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, fontFamily: 'Pretendard, sans-serif' }} />
                <button className="admin-approve-btn" onClick={handleCreateChallenge}>생성</button>
              </div>
            </div>

            <div className="admin-section-label" style={{ marginTop: 20 }}>지난 챌린지</div>
            {pastChallenges.length === 0 && <p className="admin-empty-sm">지난 챌린지가 없습니다</p>}
            {pastChallenges.map(ch => {
              const season = seasons.find(s => s.id === ch.season_id)
              const chTeams = challengeTeams.filter(t => t.challenge_id === ch.id)
              const teamCount = new Set(chTeams.map(t => t.team_num)).size
              return (
                <div key={ch.id} className="admin-member-row">
                  <div className="admin-member-info">
                    <div className="admin-member-name">{season ? `시즌 ${season.generation}` : '-'}</div>
                    <div className="admin-member-sub">{ch.start_date} ~ {ch.end_date} | {ch.goal_km}km | {teamCount}팀 {chTeams.length}명</div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ========== TAB 6: 추첨 ========== */}
        {tab === 'draw' && (
          <>
            <div className="admin-section-label">현재 분기</div>
            <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{drawQuarter}</div>
              <div style={{ fontSize: 12, color: '#666' }}>추첨권 보유 현황</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="admin-section-label" style={{ margin: 0 }}>추첨권 현황</div>
              <button style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #A51C30', background: 'none', color: '#A51C30', fontSize: 11, cursor: 'pointer' }}
                onClick={async () => { await syncTickets(); alert('추첨권 동기화 완료') }}>
                동기화
              </button>
            </div>
            {members.filter(m => m.lottery_tickets > 0).sort((a, b) => b.lottery_tickets - a.lottery_tickets).length === 0 && (
              <p className="admin-empty-sm">추첨권 보유자가 없습니다</p>
            )}
            {members.filter(m => m.lottery_tickets > 0).sort((a, b) => b.lottery_tickets - a.lottery_tickets).map(m => (
              <div key={m.nickname} className="admin-member-row">
                <div className="admin-member-info">
                  <div className="admin-member-name">{m.nickname}</div>
                  <div className="admin-member-sub">LV.{m.lv} | {(m.total_dist || 0).toFixed(1)}km</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#A51C30' }}>{m.lottery_tickets}장</span>
              </div>
            ))}

            <div style={{ marginTop: 16 }}>
              <button className="admin-action-btn" style={{ background: '#A51C30', color: '#fff', border: 'none' }} onClick={handleDraw}>
                추첨 시작 ({drawQuarter})
              </button>
            </div>

            {currentDrawResults.length > 0 && (
              <>
                <div className="admin-section-label" style={{ marginTop: 16 }}>{drawQuarter} 추첨 결과</div>
                {currentDrawResults.map(r => (
                  <div key={r.id || `${r.rank}-${r.winner_nickname}`} className="admin-member-row">
                    <div className="admin-member-info">
                      <div className="admin-member-name">
                        {r.rank}등 - {r.winner_nickname}
                        <span className="admin-badge auth">{r.ticket_count}장</span>
                      </div>
                      <div className="admin-member-sub">{r.prize}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {pastDrawQuarters.length > 0 && (
              <>
                <div className="admin-section-label" style={{ marginTop: 20 }}>지난 추첨 결과</div>
                {pastDrawQuarters.map(q => (
                  <div key={q} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 4 }}>{q}</div>
                    {drawResults.filter(r => r.quarter === q).map(r => (
                      <div key={r.id || `${q}-${r.rank}`} style={{ fontSize: 12, color: '#666', paddingLeft: 8, marginBottom: 2 }}>
                        {r.rank}등 {r.winner_nickname} ({r.prize})
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            <div className="admin-section-label" style={{ marginTop: 20 }}>분기 설정</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="예: Q3-2026" value={newQuarterName} onChange={e => setNewQuarterName(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'Pretendard, sans-serif' }} />
              <button className="admin-approve-btn" onClick={handleCreateQuarter}>새 분기 생성</button>
            </div>
          </>
        )}
      </div>

      {/* ========== Manual Activity Modal ========== */}
      {manualModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setManualModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{manualModal} 수동 입력</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 12, color: '#666' }}>날짜 *
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'Pretendard, sans-serif', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: '#666' }}>거리 (km) *
                <input type="number" step="0.01" value={manualDist} onChange={e => setManualDist(e.target.value)} placeholder="5.00"
                  style={{ display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'Pretendard, sans-serif', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: '#666' }}>시간 (HH:MM:SS)
                <input type="text" value={manualTime} onChange={e => setManualTime(e.target.value)} placeholder="00:30:00"
                  style={{ display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'Pretendard, sans-serif', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: '#666' }}>페이스 (M:SS)
                <input type="text" value={manualPace} onChange={e => setManualPace(e.target.value)} placeholder="6:00"
                  style={{ display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'Pretendard, sans-serif', marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="admin-reject-btn" style={{ flex: 1 }} onClick={() => setManualModal(null)}>취소</button>
              <button className="admin-approve-btn" style={{ flex: 1 }} onClick={handleManualActivity}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Member Detail Modal ========== */}
      {detailLoading && !detailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
          로딩 중...
        </div>
      )}
      {detailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDetailModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

            {/* 닉네임 = 실명 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
                {detailModal.nickname}
                <span style={{ color: '#bbb', margin: '0 8px', fontWeight: 400 }}>=</span>
                <span style={{ color: detailModal.real_name ? '#111' : '#bbb' }}>{detailModal.real_name || '-'}</span>
              </div>
              <button onClick={copyMemberInfo} title="닉네임 + 실명 복사" style={{ border: '1px solid #ccc', background: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 14, cursor: 'pointer' }}>📋</button>
            </div>

            {/* 뱃지 */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {detailModal.linked
                ? <span className="admin-badge auth">가입완료</span>
                : <span className="admin-badge pending">앱 미연동 회원</span>}
              {detailModal.strava_connected && <span className="admin-badge strava">Strava</span>}
              {detailModal.crews.map(c => (
                <span key={c.id} className="admin-badge" style={{ background: '#fbe9ec', color: '#A51C30' }}>{c.name}</span>
              ))}
            </div>

            {/* 가입일 */}
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              📅 가입일: {detailModal.joined_at ? new Date(detailModal.joined_at).toLocaleDateString('ko-KR') : '-'}
            </div>

            {/* 개인정보 섹션 */}
            <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>개인정보</span>
                {detailModal.linked ? (
                  <button onClick={toggleUnmask} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                    {detailModal.masked ? '🔒 전체보기' : '🔓 마스킹'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#999' }}>미연동</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.9 }}>
                <div>이름: {detailModal.real_name || <span style={{ color: '#bbb' }}>미연동</span>}</div>
                <div>전화: {detailModal.phone || <span style={{ color: '#bbb' }}>미연동</span>}</div>
                <div>이메일: {detailModal.email || <span style={{ color: '#bbb' }}>미연동</span>}</div>
              </div>
            </div>

            {/* 소속 크루 */}
            <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>소속 크루</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {crews.map(c => {
                  const joined = detailModal.crews.some(x => x.id === c.id)
                  return (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={joined} onChange={() => toggleCrewMembership(c.id)} />
                      <span>{c.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* 통계 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>LV.{detailModal.lv}</div>
                <div style={{ fontSize: 10, color: '#999' }}>레벨</div>
              </div>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{(detailModal.total_dist || 0).toFixed(1)}km</div>
                <div style={{ fontSize: 10, color: '#999' }}>총 거리</div>
              </div>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{detailModal.total_days}일</div>
                <div style={{ fontSize: 10, color: '#999' }}>활동일</div>
              </div>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{detailModal.lottery_tickets}</div>
                <div style={{ fontSize: 10, color: '#999' }}>추첨권</div>
              </div>
            </div>

            {detailModal.leave_start && (
              <div style={{ background: '#e3f2fd', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 12 }}>
                휴식: {detailModal.leave_start} ~ {detailModal.leave_end} ({detailModal.leave_reason})
              </div>
            )}
            {detailModal.remark && (
              <div style={{ fontSize: 12, color: '#A51C30', marginBottom: 12, fontStyle: 'italic' }}>비고: {detailModal.remark}</div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>최근 활동</div>
            {memberActivities.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>활동 기록이 없습니다</div>}
            {memberActivities.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span>{a.date}</span>
                <span>{a.distance_km.toFixed(2)}km</span>
                <span>{formatPace(a.avg_pace_sec)}</span>
              </div>
            ))}

            <button className="admin-reject-btn" style={{ width: '100%', marginTop: 16 }} onClick={() => setDetailModal(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}