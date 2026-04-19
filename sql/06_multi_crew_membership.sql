-- ============================================================
-- Multi-crew membership support (2026-04-19)
-- 같은 닉네임이 여러 크루에 소속 가능하도록 스키마 변경
-- 실행: Supabase SQL Editor
--
-- 변경 요약:
-- 1) members.nickname 단독 UNIQUE → (nickname, crew_id) composite UNIQUE
-- 2) activities 테이블에 crew_id 컬럼 추가 (기존 데이터 backfill)
-- 3) 같은 user_id의 person-level 필드 동기화 트리거
-- 4) member_nickname 참조 FK 8개 모두 DROP (정합성은 앱 책임)
-- ============================================================

BEGIN;

-- ─── 1. FK 8개 DROP (members.nickname 참조) ──────────────
ALTER TABLE activities          DROP CONSTRAINT IF EXISTS activities_member_nickname_fkey;
ALTER TABLE member_season_stats DROP CONSTRAINT IF EXISTS member_season_stats_member_nickname_fkey;
ALTER TABLE challenge_teams     DROP CONSTRAINT IF EXISTS challenge_teams_member_nickname_fkey;
ALTER TABLE lottery_tickets     DROP CONSTRAINT IF EXISTS lottery_tickets_member_nickname_fkey;
ALTER TABLE session_attendance  DROP CONSTRAINT IF EXISTS session_attendance_member_nickname_fkey;
ALTER TABLE crew_members        DROP CONSTRAINT IF EXISTS crew_members_member_nickname_fkey;
ALTER TABLE challenge_leaves    DROP CONSTRAINT IF EXISTS challenge_leaves_member_nickname_fkey;
ALTER TABLE payments            DROP CONSTRAINT IF EXISTS payments_member_nickname_fkey;

-- ─── 2. members.nickname UNIQUE 교체 ─────────────────────
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_nickname_key;
ALTER TABLE members ADD CONSTRAINT members_nickname_crew_uniq UNIQUE (nickname, crew_id);

-- ─── 3. activities.crew_id 추가 + 기존 데이터 backfill ──
ALTER TABLE activities ADD COLUMN IF NOT EXISTS crew_id UUID REFERENCES crews(id);

UPDATE activities a
SET crew_id = m.crew_id
FROM members m
WHERE a.crew_id IS NULL
  AND a.member_nickname = m.nickname
  AND m.crew_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_crew_nickname_date
  ON activities(crew_id, member_nickname, date);

-- ─── 4. 동기화 트리거: 같은 user_id의 다른 row 자동 복사 ─
CREATE OR REPLACE FUNCTION sync_member_person_stats() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  UPDATE members
  SET lv = NEW.lv,
      total_exp = NEW.total_exp,
      exp_pct = NEW.exp_pct,
      total_dist = NEW.total_dist,
      total_days = NEW.total_days,
      avatar_url = NEW.avatar_url,
      egg_config = NEW.egg_config,
      egg_type = NEW.egg_type,
      realname = NEW.realname,
      strava_athlete_id = NEW.strava_athlete_id
  WHERE user_id = NEW.user_id
    AND id != NEW.id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS members_person_stats_sync ON members;

CREATE TRIGGER members_person_stats_sync
  AFTER UPDATE OF lv, total_exp, exp_pct, total_dist, total_days,
                  avatar_url, egg_config, egg_type, realname, strava_athlete_id
  ON members
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 1)
  EXECUTE FUNCTION sync_member_person_stats();

COMMIT;

-- ─── 검증 쿼리 (COMMIT 후 별도 실행) ────────────────────
-- SELECT conname FROM pg_constraint
--   WHERE conname LIKE '%member_nickname%';
-- -- 기대: 0건 (전부 DROP됨)
--
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'members'::regclass AND contype = 'u';
-- -- 기대: members_nickname_crew_uniq
--
-- SELECT crew_id, COUNT(*) FROM activities GROUP BY crew_id ORDER BY count DESC;
-- -- 기대: 대부분 HRC crew_id로 채워짐
--
-- SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'members'::regclass AND NOT tgisinternal;
-- -- 기대: members_person_stats_sync
