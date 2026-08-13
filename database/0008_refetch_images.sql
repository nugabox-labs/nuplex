-- 시즌 · 에피소드 · 출연진 이미지를 다시 받게 하는 일회성 손질.
--
-- 배포 중 사고로 data/media 디렉터리가 통째로 날아갔다. 포스터 · 배경 · 아바타는
-- 전체 동기화가 다시 받아왔지만 시즌 · 에피소드 · 출연진은 채워지지 않았다.
-- sync 는 Plex 의 updatedAt 이 바뀌었거나 한 번도 안 받은 것만 훑기 때문이다
-- (sync/upsert.ts — needsDetail · needsChildren). DB 에 "이미 받았다"고 적혀 있으니
-- 파일만 사라진 지금 상태에서는 영영 건너뛴다.
--
-- 그 표식을 지운다. 다음 전체 동기화가 상세(출연진)와 자식(시즌 · 에피소드)을
-- 다시 훑고, 파일이 없는 이미지만 새로 받는다(sync/images.ts 는 있으면 건너뛴다).
-- 데이터를 지우는 것이 아니라 "다시 확인하라"는 표시다.

UPDATE media_item
   SET detail_synced_at = NULL,
       children_synced_at = NULL
 WHERE deleted_at IS NULL;
