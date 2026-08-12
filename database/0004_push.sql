-- 푸시 알림 — 앱(nuplex-app)에 보낼 준비.
--
-- 알림 한 건이 "웹의 종 아이콘"과 "앱의 푸시" 양쪽으로 나간다. 같은 notice 행을 쓴다.
-- 대상은 프로필 단위다. notice_target 이 비어 있으면 전체 발송이라는 뜻이다.

-- 앱을 설치한 기기. 웹 브라우저는 여기 들어오지 않는다.
CREATE TABLE device (
  id           bigserial PRIMARY KEY,
  -- 셸이 만드는 기기 식별자. 앱을 지웠다 깔면 새 값이 된다.
  device_id    text NOT NULL UNIQUE,
  -- FCM 토큰. 갱신되면 같은 device_id 행을 덮어쓴다.
  push_token   text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version  text,
  locale       text,
  timezone     text,
  -- 이 기기에서 고른 프로필. 알림 대상을 가리는 기준이 된다.
  profile_id   integer REFERENCES profile(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- FCM 이 UNREGISTERED/NOT_FOUND 를 주면 채운다. 죽은 토큰을 쌓아두면 발송이 느려진다.
  revoked_at   timestamptz
);

CREATE INDEX device_token_idx ON device (push_token) WHERE revoked_at IS NULL;
CREATE INDEX device_profile_idx ON device (profile_id) WHERE revoked_at IS NULL;

-- 알림의 대상 프로필. 행이 하나도 없으면 전체 발송이다.
CREATE TABLE notice_target (
  notice_id  bigint NOT NULL REFERENCES notice(id) ON DELETE CASCADE,
  profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  PRIMARY KEY (notice_id, profile_id)
);

CREATE INDEX notice_target_profile_idx ON notice_target (profile_id);

-- 기기별 발송 결과. 어디까지 나갔는지 남겨야 재시도와 원인 추적이 된다.
CREATE TABLE notice_delivery (
  id          bigserial PRIMARY KEY,
  notice_id   bigint NOT NULL REFERENCES notice(id) ON DELETE CASCADE,
  device_id   bigint NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  UNIQUE (notice_id, device_id)
);

CREATE INDEX notice_delivery_pending_idx ON notice_delivery (status) WHERE status = 'pending';
