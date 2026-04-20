'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import type { Member, SeasonStats, Season, RollingScores } from '@/lib/types'
import MyPage from '@/components/MyPage'
import ChallengeBoard from '@/components/ChallengeBoard'
// Ranking moved into ChallengeBoard tabs
import Calendar from '@/components/Calendar'
import SeasonDraw from '@/components/SeasonDraw'
import NotificationBell from '@/components/NotificationBell'

const TABS = ['챌린지', '캘린더', '추첨', 'MY'] as const

const TAB_ICONS: Record<string, React.ReactElement> = {
  '챌린지': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  '추첨': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><path d="M9 7v10"/>
    </svg>
  ),
  '캘린더': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  'MY': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
}

export default function Home() {
  const router = useRouter()
  const [activeTab, _setActiveTab] = useState<(typeof TABS)[number]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('peo_active_tab')
      if (saved && (TABS as readonly string[]).includes(saved)) return saved as (typeof TABS)[number]
    }
    return '챌린지'
  })
  const setActiveTab = (tab: (typeof TABS)[number]) => {
    _setActiveTab(tab)
    localStorage.setItem('peo_active_tab', tab)
  }
  const [members, setMembers] = useState<Member[]>([])
  const [seasonStats, setSeasonStats] = useState<SeasonStats[]>([])
  const [rollingScores, setRollingScores] = useState<Record<string, RollingScores>>({})
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [crewName, setCrewName] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setCurrentUserId(session.user.id)

      // 온보딩 체크 (다중 크루 대응: .limit(1))
      const { data: myMemRows } = await supabase
        .from('members').select('egg_config').eq('user_id', session.user.id).limit(1)
      const myMem = myMemRows?.[0]
      if (myMem && (!myMem.egg_config || !myMem.egg_config.pattern)) {
        router.push('/onboarding')
        return
      }

      // 크루 소속 체크
      const isAdmin = session.user.email === 'a5214275@naver.com'
      const { data: crewMembers } = await supabase
        .from('crew_members').select('crew_id').eq('user_id', session.user.id)

      if (!crewMembers || crewMembers.length === 0) {
        if (!isAdmin) { router.push('/crew-select'); return }
      }

      // 저장된 크루 or 첫 번째 크루 (관리자는 아무 크루 접속 가능)
      const saved = localStorage.getItem('peo_active_crew')
      const validSaved = saved && (isAdmin || crewMembers?.some(cm => cm.crew_id === saved))
      const activeCrewId = validSaved ? saved : crewMembers?.[0]?.crew_id

      if (!activeCrewId) { router.push('/crew-select'); return }

      setCrewId(activeCrewId)
      localStorage.setItem('peo_active_crew', activeCrewId)
      const { data: crew } = await supabase.from('crews').select('name').eq('id', activeCrewId).single()
      if (crew) setCrewName(crew.name)

      loadData(session.user.id, activeCrewId)

      // 푸시 알림 구독
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('/sw.js').then(async reg => {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          })
          fetchWithAuth('/api/push/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() })
          })
        }).catch(() => {})
      }
    })

    // 다른 페이지 갔다 돌아올 때 데이터 새로 로드
    const handleFocus = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        const saved = localStorage.getItem('peo_active_crew')
        if (saved) loadData(session.user.id, saved)
      })
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  async function loadData(userId?: string, userCrewId?: string) {
    setLoading(true)

    let membersQuery = supabase.from('members').select('*').eq('is_active', true).order('lv', { ascending: false })
    let seasonsQuery = supabase.from('seasons').select('*').eq('is_current', true)

    if (userCrewId) {
      membersQuery = membersQuery.eq('crew_id', userCrewId)
      seasonsQuery = seasonsQuery.eq('crew_id', userCrewId)
    }

    const [{ data: membersData }, { data: statsData }, { data: currentSeasonArr }] = await Promise.all([
      membersQuery,
      supabase.from('member_season_stats').select('*').order('total_score', { ascending: false }),
      seasonsQuery,
    ])

    const currentSeason = currentSeasonArr?.[0] || null

    const m = (membersData as Member[]) || []
    setMembers(m)
    setSeasonStats((statsData as SeasonStats[]) || [])

    if (userId) {
      let mine = m.find((mem: Member) => mem.user_id === userId)
      if (!mine) {
        // fallback: search without is_active filter + 현재 크루 우선
        let fallbackQuery = supabase.from('members').select('*').eq('user_id', userId)
        if (userCrewId) fallbackQuery = fallbackQuery.eq('crew_id', userCrewId)
        const { data: myMember, error: myErr } = await fallbackQuery.limit(1)
        if (myMember?.[0]) mine = myMember[0] as Member
        if (myErr) console.warn('member fallback error:', myErr)
      }
      setCurrentMember(mine ?? null)
    }

    const sprintStart = (currentSeason as Season | null)?.start_date ?? new Date().toISOString().split('T')[0]
    const lookback = new Date(sprintStart)
    lookback.setMonth(lookback.getMonth() - 3)
    const lookbackDate = lookback.toISOString().split('T')[0]

    const { data: windowSeasons } = await supabase
      .from('seasons').select('id').gte('start_date', lookbackDate).lte('start_date', sprintStart)

    const windowIds = (windowSeasons || []).map((s: { id: string }) => s.id)
    const totalSeasons = windowIds.length

    if (totalSeasons > 0) {
      const { data: windowStats } = await supabase
        .from('member_season_stats').select('*').in('season_id', windowIds)

      const scores: Record<string, RollingScores> = {}
      for (const member of m) {
        const nick = member.nickname
        const nStats = (windowStats || []).filter((s: SeasonStats) => s.member_nickname === nick)
        const avg = (key: keyof Pick<SeasonStats, 'speed_score' | 'endurance_score' | 'longrun_score' | 'consistency_score' | 'efficiency_score'>) =>
          nStats.reduce((sum: number, s: SeasonStats) => sum + (s[key] || 0), 0) / totalSeasons
        scores[nick] = {
          speed: avg('speed_score'), endurance: avg('endurance_score'),
          longRun: avg('longrun_score'), consistency: avg('consistency_score'),
          efficiency: avg('efficiency_score'), activeSeasons: nStats.length, totalSeasons,
        }
      }
      setRollingScores(scores)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="egg-spinner">🥚</div>
        <p>PEO 로딩 중...</p>
      </div>
    )
  }

  const myStats = seasonStats.find(s => s.member_nickname === currentMember?.nickname)
  const myRolling = currentMember ? rollingScores[currentMember.nickname] : undefined

  return (
    <div className="app">
      <header className="app-header">
        <button className="header-back-btn" onClick={() => router.push('/crew-select')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <img src="/peo-logo-center.png" alt="PEO" className="header-logo" />
        <div className="header-right">
          <NotificationBell userId={currentUserId} />
          <button className="header-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* 사이드 메뉴 */}
      {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}
      <div className={`side-menu ${menuOpen ? 'open' : ''}`}>
        <div className="side-menu-header">
          <span>메뉴</span>
          <button className="side-menu-close" onClick={() => setMenuOpen(false)}>✕</button>
        </div>
        {currentMember && (
          <div className="side-menu-profile">
            <div className="side-menu-avatar">
              {currentMember.avatar_url ? (
                <img src={currentMember.avatar_url} alt="" />
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              )}
            </div>
            <div>
              <div className="side-menu-name">{currentMember.nickname}</div>
              <div className="side-menu-lv">LV.{currentMember.lv}{crewName ? ` · ${crewName}` : ''}</div>
            </div>
          </div>
        )}
        <button className="side-menu-item" onClick={() => { setMenuOpen(false); router.push('/my-info') }}>내 정보</button>
        <button className="side-menu-item" onClick={() => { setMenuOpen(false); router.push('/crew-select') }}>크루 찾기 / 전환</button>
        <button className="side-menu-item" onClick={() => { setMenuOpen(false); router.push('/crew-admin') }}>크루 관리</button>
      </div>
      <main className="tab-content">
        {activeTab === '챌린지' && (
          <ChallengeBoard members={members} seasonStats={seasonStats} rollingScores={rollingScores} crewId={crewId} />
        )}
        {activeTab === '추첨' && (
          <SeasonDraw member={currentMember} members={members} crewId={crewId} />
        )}
        {activeTab === '캘린더' && (
          <Calendar member={currentMember} members={members} onSelectMember={() => {}} crewId={crewId} />
        )}
        {activeTab === 'MY' && (
          <MyPage
            member={currentMember}
            stats={myStats}
            rollingScores={myRolling}
            currentUserId={currentUserId}
          />
        )}
      </main>

      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`bottom-nav-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_ICONS[tab]}
            <span>{tab}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
