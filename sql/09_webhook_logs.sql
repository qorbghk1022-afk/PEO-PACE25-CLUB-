-- Strava webhook 수신 + 처리 결과 audit log.
-- 누락 발생 시 원인 추적용. 7일 후 자동 삭제 권장 (별도 cleanup job 필요 시).

CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  event jsonb NOT NULL,                 -- Strava 원본 페이로드
  athlete_id bigint,
  activity_id bigint,
  aspect_type text,                     -- create / update / delete
  status text NOT NULL,                 -- success / skipped / failed
  reason text,                          -- skip/fail 사유
  member_nickname text,                 -- 매핑된 닉네임 (있을 때)
  duration_ms int,                      -- 전체 처리 시간
  error text                            -- 에러 메시지
);

CREATE INDEX IF NOT EXISTS webhook_logs_received_at ON webhook_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_athlete ON webhook_logs (athlete_id, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_status ON webhook_logs (status, received_at DESC);
