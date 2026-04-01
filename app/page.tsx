'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats, Season, RollingScores } from '@/lib/types'
import MyPage from '@/components/MyPage'
import ChallengeBoard from '@/components/ChallengeBoard'
import Ranking from '@/components/Ranking'
import Calendar from '@/components/Calendar'

const TABS = ['챌린지', '랭킹', '캘린더', 'MY'] as const

const TAB_ICONS: Record<string, React.ReactElement> = {
  '챌린지': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  '랭킹': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/>
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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('랭킹')
  const [members, setMembers] = useState<Member[]>([])
  const [seasonStats, setSeasonStats] = useState<SeasonStats[]>([])
  const [rollingScores, setRollingScores] = useState<Record<string, RollingScores>>({})
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setCurrentUserId(session.user.id)
      loadData(session.user.id)
    })
  }, [])

  async function loadData(userId?: string) {
    setLoading(true)

    const [{ data: membersData }, { data: statsData }, { data: currentSeason }] = await Promise.all([
      supabase.from('members').select('*').eq('is_active', true).order('lv', { ascending: false }),
      supabase.from('member_season_stats').select('*').order('total_score', { ascending: false }),
      supabase.from('seasons').select('*').eq('is_current', true).single(),
    ])

    const m = (membersData as Member[]) || []
    setMembers(m)
    setSeasonStats((statsData as SeasonStats[]) || [])

    if (userId) {
      let mine = m.find((mem: Member) => mem.user_id === userId)
      if (!mine) {
        // fallback: search without is_active filter (new users may have is_active=false)
        const { data: myMember, error: myErr } = await supabase
          .from('members').select('*').eq('user_id', userId).maybeSingle()
        if (myMember) mine = myMember as Member
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
        <img src="/peo-egglog-black.png" alt="PEO" className="header-logo" />
        <button className="header-profile-btn" onClick={() => setActiveTab('MY')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
      </header>
      <main className="tab-content">
        {activeTab === '챌린지' && (
          <ChallengeBoard members={members} seasonStats={seasonStats} />
        )}
        {activeTab === '랭킹' && (
          <Ranking members={members} seasonStats={seasonStats} rollingScores={rollingScores} />
        )}
        {activeTab === '캘린더' && (
          <Calendar member={currentMember} members={members} onSelectMember={() => {}} />
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
