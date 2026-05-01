-- Sheet 동기화 활동 중복 방지를 위한 unique index.
-- (nick, date, distance_km, crew_id) 같은 sheet row가 두 번 들어가지 않도록 강제.
-- Strava 활동(strava_activity_id가 있음)은 자체적으로 strava_activity_id로 dedup되므로 제외.
--
-- 실행 전 같은 키 dup row가 모두 정리된 상태여야 함 (clean-intra-sheet-dupes.ts 실행 후).

CREATE UNIQUE INDEX IF NOT EXISTS activities_sheet_unique
ON activities (member_nickname, date, distance_km, crew_id)
WHERE strava_activity_id IS NULL;
