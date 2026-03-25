'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats } from '@/lib/types'
import MyPage from '@/components/MyPage'
import ChallengeBoard from '@/components/ChallengeBoard'
import Ranking from '@/components/Ranking'
import Calendar from '@/components/Calendar'

const TABS = ['마이페이지', '챌린지보드', '랜킹', '불꽃캘린더'] as const

export default function Home() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('랜킹')
  const [members, setMembers] = useState<Member[]>([])
  const [seasonStats, setSeasonStats] = useState<SeasonStats[]>([])
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: membersData }, { data: statsData }] = await Promise.all([
      supabase.from('members').select('*').eq('is_active', true).order('total_exp', { ascending: false }),
      supabase.from('member_season_stats').select('*').order('total_score', { ascending: false }),
    ])
    const m = (membersData as Member[]) || []
    setMembers(m)
    setSeasonStats((statsData as SeasonStats[]) || [])
    if (m.length > 0) setSelectedMember(m[0])
    setLoading(false)
  }

  function selectMember(member: Member) {
    setSelectedMember(member)
    setActiveTab('마이페이지')
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="egg-spinner">🥚</div>
        <p>PEO 로딩 중...</p>
      </div>
    )
  }

  const TAB_ICONS: Record<string, string> = {
    '마이페이지': '👤',
    '챌린지보드': '⚡',
    '랜킹': '🏆',
    '불꽃캘린더': '🔥',
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-logo">
          <span className="header-egg">🥚</span>
          <h1>PEO</h1>
          <span className="header-sub">PACE25 CLUB</span>
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_ICONS[tab]}
            <span>{tab}</span>
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {activeTab === '마이페이지' && (
          <MyPage
            member={selectedMember}
            stats={seasonStats.find(s => s.member_nickname === selectedMember?.nickname)}
            members={members}
            onSelectMember={selectMember}
          />
        )}
        {activeTab === '챌린지보드' && (
          <ChallengeBoard members={members} seasonStats={seasonStats} />
        )}
        {activeTab === '랜킹' && (
          <Ranking members={members} seasonStats={seasonStats} onSelectMember={selectMember} />
        )}
        {activeTab === '불꽃캘린더' && (
          <Calendar member={selectedMember} members={members} onSelectMember={selectMember} />
        )}
      </main>
    </div>
  )
}
