-- 동기화를 무엇이 촉발했는지. 이력 화면이 라벨을 이걸로 가른다 —
-- schedule + incremental = 정기 · schedule + full = 전체 · scan = 스캔 · manual = 수동.
--
-- 기존 행은 전부 스케줄이 돌린 것이라 기본값 'schedule' 이 그대로 맞다.
ALTER TABLE sync_run
  ADD COLUMN triggered_by text NOT NULL DEFAULT 'schedule'
  CHECK (triggered_by IN ('schedule', 'scan', 'manual'));
