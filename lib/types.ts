export type Member = {
  id: string
  nickname: string
  realname: string | null
  egg_type: string
  lv: number
  total_exp: number
  exp_pct: number
  total_dist: number
  total_days: number
  is_active: boolean
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

export type Challenge = {
  id: string
  season_id: string
  goal_km: number
  fine_per_km: number
  start_date: string
  end_date: string
}
