-- 연재 중인 시리즈 — 홈 최상단에 띄울 작품을 관리자가 직접 고른다.
--
-- media_item 에 컬럼을 붙이지 않은 이유: 그 테이블은 Plex 사본이라 sync 워커가
-- 언제든 덮어쓴다. "연재 중" 은 Plex 가 모르는 사실이므로 따로 둔다.
-- notice 와 같은 부류다 — 사람이 만든 데이터라 동기화로 복구되지 않는다(백업 대상).
--
-- 작품이 Plex 에서 사라지면 이 행도 같이 사라진다(ON DELETE CASCADE). 어차피
-- 화면에 띄울 수 없는 작품이라 남겨둘 이유가 없다.

CREATE TABLE featured_series (
  rating_key text PRIMARY KEY REFERENCES media_item(rating_key) ON DELETE CASCADE,
  -- 홈 줄에서의 순서. 같으면 최근에 켠 것이 앞에 온다.
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX featured_series_order_idx ON featured_series (sort_order, created_at DESC);
