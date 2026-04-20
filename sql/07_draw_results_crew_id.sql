-- draw_results에 crew_id 컬럼 추가 (HRC/PEO 분리 추첨)
-- 기존 row는 HRC로 backfill (Q1-2026까지는 HRC 전용이었음)

ALTER TABLE draw_results
  ADD COLUMN IF NOT EXISTS crew_id UUID REFERENCES crews(id);

-- 기존 데이터 backfill (HRC)
UPDATE draw_results
SET crew_id = '2891fdd5-545b-4144-81f6-229df8dd5457'
WHERE crew_id IS NULL;

-- 앞으로 crew_id 필수
ALTER TABLE draw_results
  ALTER COLUMN crew_id SET NOT NULL;

-- (quarter) 단독 unique가 있었으면 제거하고 (quarter, crew_id, rank) 조합으로 바꾸기
-- 확인: 아래 쿼리로 기존 제약 조회 후 필요시 DROP
-- SELECT conname FROM pg_constraint WHERE conrelid = 'draw_results'::regclass;

CREATE INDEX IF NOT EXISTS idx_draw_results_crew_quarter
  ON draw_results(crew_id, quarter);
