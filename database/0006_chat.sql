-- 채팅 — 프로필끼리 주고받는 1:1 대화.
--
-- notice 이후 두 번째로 "사람이 만드는 데이터" 다. Plex 사본이 아니라서 동기화로
-- 복구되지 않는다 — notice · featured_series 와 함께 백업 대상이다(AGENTS.md §2).
--
-- 대화 상대는 프로필이다. 계정이 아니라 "지금 보고 있는 사람" 기준이고, 관문은
-- 여전히 공통 비밀번호 하나다 — 여기에 새 권한 체계를 얹지 않는다.
--
-- 지금은 1:1 만 만든다. 그룹 채팅은 participant 테이블을 따로 붙이는 쪽으로 열어두고,
-- 여기서는 두 프로필을 열(column)로 못 박아 "같은 상대면 항상 같은 방" 을 DB 가 보장한다.

CREATE TABLE conversation (
  id              bigserial PRIMARY KEY,
  -- 항상 작은 id 를 a 에 넣는다. 그래야 (a, b) UNIQUE 하나로 방 중복을 막을 수 있다 —
  -- 애플리케이션이 정렬을 잊어도 CHECK 이 걸린다.
  profile_a_id    integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  profile_b_id    integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- 목록 정렬용. 메시지가 들어올 때마다 갱신한다(매번 message 를 뒤지지 않으려고 둔다).
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CHECK (profile_a_id < profile_b_id),
  UNIQUE (profile_a_id, profile_b_id)
);

CREATE INDEX conversation_a_idx ON conversation (profile_a_id, last_message_at DESC);
CREATE INDEX conversation_b_idx ON conversation (profile_b_id, last_message_at DESC);

CREATE TABLE message (
  id              bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  sender_id       integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_conversation_idx ON message (conversation_id, id DESC);

-- 어디까지 읽었는지. 알림 배지는 브라우저 localStorage 로 버텼지만 채팅은 기기를
-- 넘나들며 이어 봐야 해서 서버에 남긴다.
CREATE TABLE conversation_read (
  conversation_id      bigint NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  profile_id           integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  last_read_message_id bigint NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);
