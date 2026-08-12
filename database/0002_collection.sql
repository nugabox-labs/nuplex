-- 컬렉션 — Plex 에서 사람이 직접 묶어둔 시리즈 모음(마블 시네마틱 유니버스 · 007 …).
--
-- 작품 상세의 Collection 필드가 주는 id 는 컬렉션의 ratingKey 가 아니라 별개의 태그 id 다.
-- 그래서 소속은 반드시 컬렉션 → /children 방향으로 채운다 — 반대로 하면 조용히 안 붙는다.

CREATE TABLE collection (
  rating_key      text PRIMARY KEY,
  section_id      integer NOT NULL REFERENCES library_section(id) ON DELETE CASCADE,
  title           text NOT NULL,
  title_sort      text,
  summary         text,
  poster_file     text,
  backdrop_file   text,
  child_count     integer,
  plex_added_at   timestamptz,
  plex_updated_at timestamptz,
  deleted_at      timestamptz,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX collection_section_idx ON collection (section_id) WHERE deleted_at IS NULL;
CREATE INDEX collection_title_trgm_idx ON collection USING gin (title gin_trgm_ops);

-- 작품이 어느 컬렉션에 속하는지. sort_order 는 Plex 가 준 순서(대개 개봉순)를 그대로 쓴다.
CREATE TABLE collection_item (
  collection_rating_key text NOT NULL REFERENCES collection(rating_key) ON DELETE CASCADE,
  rating_key            text NOT NULL REFERENCES media_item(rating_key) ON DELETE CASCADE,
  sort_order            integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_rating_key, rating_key)
);

CREATE INDEX collection_item_item_idx ON collection_item (rating_key);
