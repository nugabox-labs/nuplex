-- AI 취향 요약 · 추천 (딥시크) ------------------------------------------------
--
-- 딥시크 v4 는 전부 추론 모델이라 답 하나에 30초~1분이 걸린다(실측. reasoning 토큰만
-- 1,000~2,000개를 쓴다). 화면 그리는 길에서 부를 수 없어, 결과를 여기 담아두고
-- 화면이 뜬 뒤에 채운다 — Plex 를 sync 워커로 몰아넣은 것과 같은 이유다.

-- 관리자가 고른 값. 지금은 쓸 모델(`model`) 하나뿐이다.
-- 사람이 만든 데이터이긴 하나 잃어도 관리자 화면에서 한 번 다시 고르면 끝이라,
-- AGENTS.md §2 의 백업 목록에는 넣지 않았다. 여기 담기는 것이 늘어나면 그때 상의한다.
CREATE TABLE ai_setting (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 프로필별 취향 요약 · 추천. 시청 기록에서 다시 만들 수 있어 백업 대상이 아니다.
CREATE TABLE profile_taste (
  profile_id integer PRIMARY KEY REFERENCES profile(id) ON DELETE CASCADE,
  -- 만들 때 쓴 모델. 관리자가 모델을 바꾸면 다음 열람에서 새로 만든다.
  model      text NOT NULL,
  summary    text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',
  -- 추천. [{ "ratingKey": "1201", "reason": "…" }] 꼴이다.
  -- 라이브러리에 실제로 있는 작품만 담긴다 — 없는 것을 지어내면 저장 전에 걸러낸다.
  picks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 만들 당시 이 사람의 시청 편수. 이보다 충분히 더 봤으면 다시 만든다.
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 호출 한 건. 관리자 화면의 월별 사용량 표가 이걸 접어서 보여준다.
-- 실패한 호출도 남긴다 — 안 되는 이유를 화면에서 봐야 한다.
CREATE TABLE ai_usage (
  id                bigserial PRIMARY KEY,
  model             text NOT NULL,
  -- 무슨 일로 불렀는가. 지금은 'taste' 하나뿐이다.
  purpose           text NOT NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  -- 딥시크는 추론(reasoning) 토큰도 여기에 합쳐서 준다.
  completion_tokens integer NOT NULL DEFAULT 0,
  -- 프롬프트 캐시로 아낀 몫. prompt_tokens 안에 이미 포함된 수다.
  cached_tokens     integer NOT NULL DEFAULT 0,
  ok                boolean NOT NULL DEFAULT true,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 조회 형태는 "월별로 접어서 최근 것부터" 하나뿐이다.
CREATE INDEX ai_usage_created_idx ON ai_usage (created_at DESC);
