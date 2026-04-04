export type Member = {
  id: string
  user_id: string | null
  nickname: string
  realname: string | null
  egg_type: string
  lv: number
  total_exp: number
  exp_pct: number
  total_dist: number
  total_days: number
  is_active: boolean
  avatar_url: string | null
  lottery_tickets: number
  created_at: string | null
}

export type SeasonStats = {
  id: string
  member_nickname: string
  season_id: string
  distance_km: number
  longest_run_km: number
  avg_pace_sec: number
  days_run: number
  efficiency: number
  endurance_score: number
  speed_score: number
  longrun_score: number
  consistency_score: number
  efficiency_score: number
  total_score: number
  rank: number | null
}

export type Activity = {
  id: string
  strava_activity_id: number | null
  member_nickname: string
  date: string
  distance_km: number
  moving_time_sec: number
  elapsed_time_sec: number
  avg_pace_sec: number
  efficiency: number
  sport_type: string | null
  activity_name: string | null
}

export type Season = {
  id: string
  generation: number
  start_date: string
  end_date: string
  is_current: boolean
}

/** 최근 3개월 롤링 평균 능력치
 *  현재 스프린트 시작일 기준 3개월 전 스프린트들의 평균
 *  안 뛴 시즌은 0점으로 포함 → 자연 감소 반영
 */
export type RollingScores = {
  speed: number
  endurance: number
  longRun: number
  consistency: number
  efficiency: number
  activeSeasons: number   // 실제로 뛴 시즌 수
  totalSeasons: number    // 윈도우 내 전체 시즌 수
}

export type Challenge = {
  id: string
  season_id: string
  goal_km: number
  fine_per_km: number
  start_date: string
  end_date: string
}

export type Crew = {
  id: string
  name: string
  description: string | null
  leader_user_id: string
  max_members: number
  created_at: string
  member_count?: number
}

export type CrewMember = {
  id: string
  crew_id: string
  user_id: string
  member_nickname: string
  role: 'leader' | 'member'
  joined_at: string
}

export type JoinRequest = {
  id: string
  crew_id: string
  user_id: string
  member_nickname: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  metadata: Record<string, unknown>
  is_read: boolean
  created_at: string
}
