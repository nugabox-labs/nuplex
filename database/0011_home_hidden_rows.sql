-- 홈에서 숨긴 줄. 차례(0010)와 같은 자리에 둔다.
--
-- 라이브러리 줄만 숨길 수 있다 — "이어서 보기" 는 자리가 고정이고, 최근 추가 ·
-- 연재 중 · 시리즈 모음은 순서만 바꾼다. 값은 홈 줄의 키 배열이다(예: {section-3}).

ALTER TABLE profile ADD COLUMN IF NOT EXISTS home_hidden_rows text[];
