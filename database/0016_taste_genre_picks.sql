-- 장르별 추천 — "볼 만한 스릴러 작품" 처럼 홈 줄 하나가 되는 목록.
--
-- 장르를 고르는 일(무엇을 좋아하는가)은 취향 분석이 이미 했다. 그 장르 안에서 작품을
-- 줄 세우는 일은 "안 본 것 중 평점 높은 순" 이 전부라 SQL 이 더 정확하고 값도 안 든다.
-- 그래서 이 칸은 LLM 이 아니라 lib/watch.ts 의 getGenrePicks 가 채운다.
--
-- 값은 [{ "genre": "스릴러", "ratingKeys": ["1201", …] }] 꼴이다.

ALTER TABLE profile_taste
  ADD COLUMN IF NOT EXISTS genre_picks jsonb NOT NULL DEFAULT '[]'::jsonb;
