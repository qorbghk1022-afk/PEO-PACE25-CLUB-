-- PEO RLS (Row Level Security) 설정
-- Supabase SQL Editor에서 실행하세요

-- ============================================
-- 1. 모든 테이블 RLS 활성화
-- ============================================
ALTER TABLE members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_teams    ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. members 정책
-- ============================================
-- 로그인한 유저면 전체 목록 읽기 가능 (랭킹, 챌린지보드 표시용)
CREATE POLICY "members_read" ON members
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 본인 row만 수정 가능
CREATE POLICY "members_update_own" ON members
  FOR UPDATE USING (auth.uid() = user_id);

-- 회원가입 시 새 row 삽입 가능
CREATE POLICY "members_insert_own" ON members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 3. activities 정책
-- ============================================
-- 로그인한 유저면 모든 활동 읽기 가능 (캘린더, 챌린지보드용)
CREATE POLICY "activities_read" ON activities
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- 4. seasons 정책
-- ============================================
CREATE POLICY "seasons_read" ON seasons
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- 5. member_season_stats 정책
-- ============================================
CREATE POLICY "stats_read" ON member_season_stats
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- 6. challenges 정책
-- ============================================
CREATE POLICY "challenges_read" ON challenges
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- 7. challenge_teams 정책
-- ============================================
CREATE POLICY "challenge_teams_read" ON challenge_teams
  FOR SELECT USING (auth.uid() IS NOT NULL);
