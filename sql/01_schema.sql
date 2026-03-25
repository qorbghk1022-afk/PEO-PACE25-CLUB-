-- PEO PACE25 Club DB Schema
-- (이미 Supabase SQL Editor에서 실행 완료)

CREATE TABLE members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nickname VARCHAR(50) UNIQUE NOT NULL,
  realname VARCHAR(50),
  strava_athlete_id BIGINT,
  egg_type VARCHAR(20) DEFAULT 'star',
  lv INTEGER DEFAULT 1,
  total_exp DECIMAL(10,2) DEFAULT 0,
  exp_pct DECIMAL(5,2) DEFAULT 0,
  total_dist DECIMAL(10,2) DEFAULT 0,
  total_days INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  strava_activity_id BIGINT UNIQUE,
  member_nickname VARCHAR(50) REFERENCES members(nickname),
  athlete_firstname VARCHAR(50),
  athlete_lastname VARCHAR(50),
  date DATE,
  distance_km DECIMAL(8,2),
  moving_time_sec INTEGER,
  elapsed_time_sec INTEGER,
  avg_pace_sec INTEGER,
  efficiency DECIMAL(5,4),
  sport_type VARCHAR(30),
  activity_name VARCHAR(200),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE seasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  generation INTEGER,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE member_season_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_nickname VARCHAR(50) REFERENCES members(nickname),
  season_id UUID REFERENCES seasons(id),
  distance_km DECIMAL(8,2) DEFAULT 0,
  longest_run_km DECIMAL(8,2) DEFAULT 0,
  avg_pace_sec INTEGER DEFAULT 0,
  days_run INTEGER DEFAULT 0,
  efficiency DECIMAL(5,4) DEFAULT 0,
  endurance_score DECIMAL(5,2) DEFAULT 0,
  speed_score DECIMAL(5,2) DEFAULT 0,
  longrun_score DECIMAL(5,2) DEFAULT 0,
  consistency_score DECIMAL(5,2) DEFAULT 0,
  efficiency_score DECIMAL(5,2) DEFAULT 0,
  total_score DECIMAL(5,2) DEFAULT 0,
  rank INTEGER,
  UNIQUE(member_nickname, season_id)
);

CREATE TABLE challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES seasons(id),
  goal_km DECIMAL(5,2) DEFAULT 15,
  fine_per_km INTEGER DEFAULT 3000,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE challenge_teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID REFERENCES challenges(id),
  team_num INTEGER,
  member_nickname VARCHAR(50) REFERENCES members(nickname)
);

CREATE TABLE sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activity_count INTEGER DEFAULT 0,
  status VARCHAR(20),
  message TEXT
);
