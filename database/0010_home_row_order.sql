-- 홈에 라이브러리 줄이 나오는 차례를 프로필에 저장한다.
--
-- 처음에는 브라우저(localStorage)에 뒀는데, 기기를 바꾸면 사라진다. 프로필을 따라
-- 다녀야 하는 값이라 서버로 옮긴다.
--
-- 표를 새로 만들지 않고 profile 에 칸을 더한다. profile 은 이미 사람이 만드는
-- 데이터라 백업 대상이다(AGENTS §2) — 새 표를 만들면 백업 대상이 하나 늘어난다.
--
-- 값은 홈 줄의 키 배열이다(예: {section-13,section-2,…}). 비어 있으면 서버가 정한
-- 기본 차례를 쓴다. 여기 없는 줄은 뒤에 붙으므로 라이브러리가 새로 생겨도 사라지지 않는다.

ALTER TABLE profile ADD COLUMN IF NOT EXISTS home_row_order text[];
