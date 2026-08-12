-- 알림(공지) — 관리자가 "최근 업로드된 작품" 같은 소식을 올리면 방문자가 종 아이콘에서 본다.
--
-- 이 테이블만 Plex 사본이 아니다. 사람이 만든 유일한 데이터라서 동기화로 복구되지 않는다.
-- 한 행이 그대로 푸시 알림 한 건이 된다(title = 푸시 제목, body = 푸시 본문).
-- 앱이 붙을 때 발송 이력만 옆에 붙이면 되고 이 구조는 그대로 쓴다.

CREATE TABLE notice (
  id           bigserial PRIMARY KEY,
  title        text NOT NULL,
  -- 카카오톡에 보내던 원문 그대로. 이모지 · 줄바꿈을 보존한다.
  body         text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notice_published_idx ON notice (published_at DESC);
