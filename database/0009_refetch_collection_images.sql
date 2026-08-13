-- 컬렉션 포스터를 다시 받게 하는 일회성 손질. 0008 과 같은 사고의 뒷정리다.
--
-- syncCollections 는 Plex 의 updatedAt 이 DB 값과 같으면 그 컬렉션을 통째로
-- 건너뛴다(제목 · 편수만 갱신). 이미지 함수까지 가지 않으므로, 파일만 사라진
-- 지금 상태에서는 포스터가 영영 안 채워진다 — 실제로 전체 동기화를 두 번 돌려도
-- 76개가 모두 빈 채였다.
--
-- 수정 시각을 비워 "바뀐 것"으로 보게 한다. 다음 동기화가 컬렉션을 다시 훑고,
-- 없는 이미지만 새로 받는다(sync/images.ts 는 있으면 건너뛴다). 이 값은 그때
-- Plex 가 준 값으로 다시 채워진다.

UPDATE collection
   SET plex_updated_at = NULL
 WHERE deleted_at IS NULL;
