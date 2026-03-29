-- 개인정보 전용 테이블 (전화/주소는 앱에서 암호화 후 저장)
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  real_name     TEXT,
  phone_enc     TEXT,   -- AES-256-GCM 암호화
  address_enc   TEXT,   -- AES-256-GCM 암호화
  privacy_agreed_at  TIMESTAMPTZ,
  strava_agreed_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;

-- 본인만 읽기/쓰기
CREATE POLICY "profiles_self_only" ON member_profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
