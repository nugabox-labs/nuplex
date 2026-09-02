-- 인기 작품 — "가장 인기있는 작품" 줄이 읽는 값.
--
-- Plex 는 이 값을 주지 않는다. `viewCount` 는 토큰 주인(관리자) 본인의 것뿐이라
-- 공유 친구들이 무엇을 봤는지는 안 들어 있다. 그래서 우리 시청 기록(watch_history)에서
-- 직접 센다 — **본 사람 수**다(전체 기간 · 사람당 몇 번을 봤든 1). 한 사람이 드라마
-- 한 편을 몰아봤다고 1위가 되면 "인기" 가 아니라 "누가 어제 뭘 봤나" 가 된다.
--
-- 산정값이라 sync 워커가 매 동기화마다 다시 만든다. Plex 사본과 마찬가지로
-- 백업 대상이 아니다(AGENTS.md §2).

ALTER TABLE media_item ADD COLUMN popularity integer NOT NULL DEFAULT 0;

-- 분류별 인기 줄이 타는 경로.
CREATE INDEX media_item_popular_idx
  ON media_item (section_id, popularity DESC)
  WHERE deleted_at IS NULL;
