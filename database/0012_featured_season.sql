-- 시즌 단위 연재 — 작품 전체가 아니라 "시즌 2 만 연재 중" 인 경우를 담는다.
--
-- featured_series(0005) 와 나란한 표다. 한쪽에 시즌 컬럼을 붙이지 않은 이유는
-- 참조 대상이 다르기 때문이다 — 작품은 media_item, 시즌은 season 을 가리킨다.
-- 둘 다 사람이 만든 데이터라 동기화로 복구되지 않는다(AGENTS §2 백업 대상).
--
-- 시즌이 Plex 에서 사라지면 이 행도 같이 사라진다(ON DELETE CASCADE).

CREATE TABLE featured_season (
  rating_key text PRIMARY KEY REFERENCES season(rating_key) ON DELETE CASCADE,
  -- 홈 줄에서의 순서. featured_series 와 같은 기준으로 섞어 정렬한다.
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX featured_season_order_idx ON featured_season (sort_order, created_at DESC);
