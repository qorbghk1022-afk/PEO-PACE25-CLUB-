'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { Member, SeasonStats, Season, RollingScores } from '@/lib/types'
import MyPage from '@/components/MyPage'
import ChallengeBoard from '@/components/ChallengeBoard'
import Ranking from '@/components/Ranking'
import Calendar from '@/components/Calendar'

const TABS = ['마이페이지', '챌린지보드', '랜킹', '불꽃캘린더'] as const

export default function Home() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('랜킹')
  const [members, setMembers] = useState<Member[]>([])
  const [seasonStats, setSeasonStats] = useState<SeasonStats[]>([])
  const [rollingScores, setRollingScores] = useState<Record<string, RollingScores>>({})
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
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

    // 로그인한 유저를 기본 선택
    if (userId) {
      const mine = m.find((mem: Member) => mem.user_id === userId)
      setSelectedMember(mine ?? m[0] ?? null)
    } else if (m.length > 0) {
      setSelectedMember(m[0])
    }

    // 롤링 평균: 현재 스프린트 시작일 기준 3개월 전 윈도우
    const sprintStart = (currentSeason as Season | null)?.start_date ?? new Date().toISOString().split('T')[0]
    const lookback = new Date(sprintStart)
    lookback.setMonth(lookback.getMonth() - 3)
    const lookbackDate = lookback.toISOString().split('T')[0]

    const { data: windowSeasons } = await supabase
      .from('seasons')
      .select('id')
      .gte('start_date', lookbackDate)
      .lte('start_date', sprintStart)

    const windowIds = (windowSeasons || []).map((s: { id: string }) => s.id)
    const totalSeasons = windowIds.length

    if (totalSeasons > 0) {
      const { data: windowStats } = await supabase
        .from('member_season_stats')
        .select('*')
        .in('season_id', windowIds)

      const scores: Record<string, RollingScores> = {}
      for (const member of m) {
        const nick = member.nickname
        const nStats = (windowStats || []).filter((s: SeasonStats) => s.member_nickname === nick)
        // 안 뛴 시즌은 0점으로 채워서 평균 → 자연 감소
        const avg = (key: keyof Pick<SeasonStats, 'speed_score' | 'endurance_score' | 'longrun_score' | 'consistency_score' | 'efficiency_score'>) =>
          nStats.reduce((sum: number, s: SeasonStats) => sum + (s[key] || 0), 0) / totalSeasons
        scores[nick] = {
          speed: avg('speed_score'),
          endurance: avg('endurance_score'),
          longRun: avg('longrun_score'),
          consistency: avg('consistency_score'),
          efficiency: avg('efficiency_score'),
          activeSeasons: nStats.length,
          totalSeasons,
        }
      }
      setRollingScores(scores)
    }

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
        <img src="/pace25-banner.png" alt="PACE25" className="header-banner" />
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
            rollingScores={selectedMember ? rollingScores[selectedMember.nickname] : undefined}
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
