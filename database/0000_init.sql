-- NUPLEX 초기 스키마 — Plex 라이브러리 미러
--
-- 이 DB 는 Plex 의 사본이다. 진실의 원천은 항상 Plex 이고, 여기 있는 모든 행은
-- sync 워커가 다시 만들 수 있다. 사람이 만든 데이터는 없다.
-- Plex 에서 사라진 항목은 지우지 않고 deleted_at 을 채운다(전체 동기화가 감지한다).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 라이브러리 섹션 (영화 · TV 등) --------------------------------------------
CREATE TABLE library_section (
  id          integer PRIMARY KEY,        -- Plex 섹션 key
  title       text    NOT NULL,
  type        text    NOT NULL CHECK (type IN ('movie', 'show')),
  synced_at   timestamptz
);

-- 작품 (영화 · 시리즈) -------------------------------------------------------
CREATE TABLE media_item (
  rating_key              text PRIMARY KEY,
  section_id              integer NOT NULL REFERENCES library_section(id) ON DELETE CASCADE,
  type                    text    NOT NULL CHECK (type IN ('movie', 'show')),
  title                   text    NOT NULL,
  title_sort              text,
  original_title          text,
  year                    integer,
  tagline                 text,
  summary                 text,
  content_rating          text,
  duration_ms             integer,          -- 영화 러닝타임
  critic_rating           real,             -- 0–10
  audience_rating         real,             -- 0–10
  studio                  text,
  originally_available_at date,
  child_count             integer,          -- 시리즈: 시즌 수
  leaf_count              integer,          -- 시리즈: 전체 에피소드 수
  poster_file             text,             -- data/media 아래 파일명. 없으면 NULL
  backdrop_file           text,
  plex_added_at           timestamptz,
  plex_updated_at         timestamptz,
  detail_synced_at        timestamptz,      -- 출연진 등 상세를 마지막으로 받은 시각
  children_synced_at      timestamptz,      -- 시즌 · 에피소드를 마지막으로 받은 시각
  deleted_at              timestamptz,
  synced_at               timestamptz NOT NULL DEFAULT now()
);

-- 홈 화면의 "최근 추가" · 목록 페이지가 타는 경로
CREATE INDEX media_item_browse_idx
  ON media_item (type, plex_added_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX media_item_sort_idx
  ON media_item (title_sort)
  WHERE deleted_at IS NULL;
-- 부분일치 검색 (제목 · 원제)
CREATE INDEX media_item_title_trgm_idx ON media_item USING gin (title gin_trgm_ops);
CREATE INDEX media_item_original_title_trgm_idx ON media_item USING gin (original_title gin_trgm_ops);

-- 장르 ----------------------------------------------------------------------
CREATE TABLE genre (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE media_item_genre (
  rating_key text NOT NULL REFERENCES media_item(rating_key) ON DELETE CASCADE,
  genre_id   integer NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (rating_key, genre_id)
);
CREATE INDEX media_item_genre_genre_idx ON media_item_genre (genre_id);

-- 인물 · 크레딧 --------------------------------------------------------------
CREATE TABLE person (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  thumb_file text
);
CREATE INDEX person_name_trgm_idx ON person USING gin (name gin_trgm_ops);

CREATE TABLE credit (
  rating_key text NOT NULL REFERENCES media_item(rating_key) ON DELETE CASCADE,
  person_id  integer NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('director', 'writer', 'actor')),
  character  text,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (rating_key, person_id, role)
);
CREATE INDEX credit_person_idx ON credit (person_id);

-- 시즌 · 에피소드 ------------------------------------------------------------
CREATE TABLE season (
  rating_key      text PRIMARY KEY,
  show_rating_key text NOT NULL REFERENCES media_item(rating_key) ON DELETE CASCADE,
  season_index    integer,                 -- 0 = 스페셜
  title           text NOT NULL,
  summary         text,
  poster_file     text,
  leaf_count      integer,
  plex_updated_at timestamptz,
  deleted_at      timestamptz,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX season_show_idx ON season (show_rating_key, season_index);

CREATE TABLE episode (
  rating_key              text PRIMARY KEY,
  show_rating_key         text NOT NULL REFERENCES media_item(rating_key) ON DELETE CASCADE,
  season_rating_key       text REFERENCES season(rating_key) ON DELETE SET NULL,
  season_index            integer,
  episode_index           integer,
  title                   text NOT NULL,
  summary                 text,
  duration_ms             integer,
  thumb_file              text,
  originally_available_at date,
  plex_added_at           timestamptz,
  plex_updated_at         timestamptz,
  deleted_at              timestamptz,
  synced_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX episode_show_idx ON episode (show_rating_key, season_index, episode_index);
CREATE INDEX episode_season_idx ON episode (season_rating_key, episode_index);

-- 동기화 상태 ----------------------------------------------------------------
-- 마지막 성공 시각 · 섹션별 진행 위치 같은 재개용 커서를 담는다.
-- 라이브러리가 커서 한 번에 다 못 돌더라도 다음 실행이 여기서부터 이어받는다.
CREATE TABLE sync_state (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_run (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('incremental', 'full')),
  status        text NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  items_seen    integer NOT NULL DEFAULT 0,
  items_upserted integer NOT NULL DEFAULT 0,
  episodes_upserted integer NOT NULL DEFAULT 0,
  images_saved  integer NOT NULL DEFAULT 0,
  items_deleted integer NOT NULL DEFAULT 0,
  error         text
);
CREATE INDEX sync_run_started_idx ON sync_run (started_at DESC);
