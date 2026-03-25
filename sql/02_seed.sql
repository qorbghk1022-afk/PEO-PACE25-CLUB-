-- 1기 회원 27명 시드
INSERT INTO members (nickname, egg_type, is_active) VALUES
  ('순현', 'star', true), ('양봉', 'cloud', true), ('재형', 'moon', true),
  ('혀노', 'heart', true), ('뽀기아빠', 'sun', true), ('런징', 'star', true),
  ('HappyAI', 'cloud', true), ('멀루', 'moon', true), ('키가케이던스', 'heart', true),
  ('경민', 'sun', true), ('JM', 'star', true), ('키키키', 'cloud', true),
  ('머룬', 'moon', true), ('연', 'heart', true), ('익런', 'sun', true),
  ('백화', 'star', true), ('네모러너', 'cloud', true), ('제로', 'moon', true),
  ('갤러리킴', 'heart', true), ('배당의민족', 'sun', true), ('SJ', 'star', true),
  ('꾸마', 'cloud', true), ('부개동러너', 'moon', true), ('진원', 'heart', true),
  ('스응민', 'sun', true), ('원', 'star', true), ('찬우', 'cloud', true)
ON CONFLICT (nickname) DO NOTHING;

-- 1기 시즌 생성 (2025-12-01 ~)
INSERT INTO seasons (generation, start_date, end_date, is_current)
VALUES (1, '2025-12-01', '2026-06-30', true)
ON CONFLICT DO NOTHING;

-- 현재 챌린지 (실제 날짜로 수정 후 실행)
-- INSERT INTO challenges (season_id, goal_km, fine_per_km, start_date, end_date)
-- SELECT id, 15, 3000, '2026-03-09', '2026-03-22'
-- FROM seasons WHERE is_current = true;
