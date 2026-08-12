-- 프로필 — "지금 보는 사람이 누구인가".
--
-- 두 겹이다.
--   plex_account : Plex 에서 긁어온 사본. 동기화가 다시 만들 수 있다.
--   profile      : 우리가 관리하는 층. 노출 여부 · 표시 이름 · 이메일 보정.
--                  사람이 만든 데이터라 동기화로 복구되지 않는다.
--
-- 공통 비밀번호를 통과한 뒤 프로필을 고르고, 그 프로필의 가입 이메일을 한 번 맞히면
-- 브라우저(앱)에 저장된다. 별도 PIN 은 두지 않는다.

CREATE TABLE plex_account (
  id         bigint PRIMARY KEY,        -- Plex 계정 id
  name       text NOT NULL,
  username   text,
  email      text,
  -- 어디서 발견했는지. 한 사람이 여러 곳에 걸쳐 있을 수 있다.
  is_home    boolean NOT NULL DEFAULT false,   -- plex.tv Home 사용자
  is_friend  boolean NOT NULL DEFAULT false,   -- 라이브러리 공유 친구
  is_server  boolean NOT NULL DEFAULT false,   -- 서버에 접속 이력이 있는 계정
  is_admin   boolean NOT NULL DEFAULT false,
  avatar_file text,                     -- data/media/avatars 아래 파일명
  synced_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE profile (
  id              serial PRIMARY KEY,
  plex_account_id bigint UNIQUE REFERENCES plex_account(id) ON DELETE CASCADE,
  -- 비우면 plex_account.name 을 쓴다. Plex 계정명이 별로일 때만 채운다.
  display_name    text,
  -- Plex 에 이메일이 없는 계정(서버 접속 이력만 있는 경우)을 관리자가 채워 넣는 자리.
  email_override  text,
  -- 기본은 숨김. 관리자가 켠 사람만 선택 화면에 나온다.
  enabled         boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_enabled_idx ON profile (enabled, sort_order);
