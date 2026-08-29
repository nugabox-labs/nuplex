-- "내 취향" 의 시청 목록에서 사람이 직접 감춘 작품.
--
-- 표를 새로 만들지 않고 profile 에 칸을 더한다 — 0010 · 0011 과 같은 이유다.
-- profile 은 이미 사람이 만드는 데이터라 백업 대상이고(AGENTS.md §2),
-- 새 표를 만들면 백업 대상이 하나 늘어난다.
--
-- 값은 작품의 rating_key 배열이다. 시청 기록(watch_history) 자체는 건드리지 않는다 —
-- 그건 Plex 사본이라 지워봐야 다음 동기화가 되살린다. 목록에서 보이지만 않게 한다.
-- 그래서 통계는 감춘 것까지 그대로 센다.

ALTER TABLE profile ADD COLUMN IF NOT EXISTS hidden_watched_items text[];
