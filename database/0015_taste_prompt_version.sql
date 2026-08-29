-- 담아둔 취향 요약이 어느 판으로 만들어졌는지.
--
-- 프롬프트나 저장 형식을 고쳐도 담아둔 것은 그대로 남는다. 실제로 겪었다 —
-- picks 를 [{ratingKey, reason}] 에서 rating_key 배열로 바꿨더니, 옛 행을 읽을 때
-- pg 가 객체를 문자열로 밀어 넣어 **에러 없이 0건**이 됐다. 홈의 추천 줄이 통째로
-- 사라졌는데 로그에는 아무것도 안 남았다. 요약 문장도 옛 말투가 계속 나왔다.
--
-- 그래서 코드가 쥔 판 번호(lib/ai/taste.ts 의 PROMPT_VERSION)와 다르면 낡은 것으로
-- 보고 다시 만든다. 기본값 0 이라 지금 담긴 것은 전부 한 번씩 새로 만들어진다.

ALTER TABLE profile_taste ADD COLUMN IF NOT EXISTS prompt_version integer NOT NULL DEFAULT 0;
