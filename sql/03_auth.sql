-- Supabase Auth 연동: members 테이블에 user_id 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) UNIQUE;
