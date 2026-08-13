-- 시청 기록 — Plex 의 /status/sessions/history/all 사본.
--
-- 관리자 토큰 하나로 모든 공유 사용자의 기록을 accountID 로 걸러 받을 수 있다.
-- 못 받는 것은 재생 위치(viewOffset)다 — onDeck 은 accountID 를 조용히 무시하고,
-- 남의 토큰은 Home 사용자가 아닌 공유 친구에게서는 얻을 수 없다. 그래서 홈의
-- "이어서 보기" 는 "37분 남음" 이 아니라 "마지막으로 본 화의 다음 화" 로 만든다.
--
-- Plex 사본이라 sync 가 다시 만들 수 있다. 백업 대상이 아니다(AGENTS.md §2).

CREATE TABLE watch_history (
  -- Plex 가 준 기록 한 건의 키(/status/sessions/history/2660 의 끝 숫자).
  -- 같은 화를 여러 번 봐도 기록은 따로 쌓이므로 이걸 그대로 기본키로 쓴다.
  history_key     bigint PRIMARY KEY,
  -- plex_account.id. 서버 소유자는 Plex 가 로컬 계정 id(1)로 기록하므로
  -- sync 가 is_admin 계정으로 바꿔 넣는다.
  plex_account_id bigint NOT NULL REFERENCES plex_account(id) ON DELETE CASCADE,
  -- 본 항목. 에피소드 또는 영화다. media_item · episode 를 참조하지 않는다 —
  -- 제외 섹션(음악 등)이나 이미 지워진 항목의 기록도 그대로 들어온다.
  rating_key      text NOT NULL,
  type            text NOT NULL,
  -- 에피소드일 때 그 시리즈. 시리즈별 마지막 시청을 찾는 데 쓴다.
  show_rating_key text,
  viewed_at       timestamptz NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

-- "이 사람이 이 시리즈를 마지막으로 본 게 언제인가" 가 유일한 조회 형태다.
CREATE INDEX watch_history_show_idx
  ON watch_history (plex_account_id, show_rating_key, viewed_at DESC);
-- 이미 본 항목인지 확인할 때(영화 제외 · 본 화 건너뛰기).
CREATE INDEX watch_history_item_idx ON watch_history (plex_account_id, rating_key);
