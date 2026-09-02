import { db, queryOne } from '@/lib/db'

// 수동 동기화 요청 — 관리자 화면(web)과 sync 워커 사이에 놓는 쪽지 한 장.
//
// web 은 Plex 를 부르지 못한다(AGENTS §2 · 예외는 라이브러리 스캔 하나뿐). 그래서 버튼은
// sync_state 에 "지금 한 번 돌려 달라" 만 적고, 워커가 주기적으로 그걸 집어 간다.
// 표를 새로 만들지 않는 이유는 scan_favorites 와 같다 — 잃어버려도 다시 누르면 그만이다.
//
// 'server-only' 를 걸지 않는다. 워커가 import 해야 한다 — AGENTS §4.

export type SyncRequestKind = 'incremental' | 'full'

const KEY = 'sync_request'

/** 화면에서 부른다. 이미 요청이 있으면 시각만 새로 쓴다. */
export async function requestSync(kind: SyncRequestKind): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, kind],
  )
}

/** 아직 워커가 안 집어 간 요청. 화면에 "대기 중" 을 보여주려고 읽는다. */
export async function readSyncRequest(): Promise<{ kind: SyncRequestKind; requestedAt: Date } | null> {
  const row = await queryOne<{ value: string; requestedAt: Date }>(
    `SELECT value, updated_at AS "requestedAt" FROM sync_state WHERE key = $1`,
    [KEY],
  )
  if (!row) return null
  return { kind: row.value === 'full' ? 'full' : 'incremental', requestedAt: row.requestedAt }
}

/** 워커가 부른다. 읽는 즉시 지운다 — 같은 요청으로 두 번 돌지 않게. */
export async function takeSyncRequest(): Promise<SyncRequestKind | null> {
  const row = await queryOne<{ value: string }>(
    `DELETE FROM sync_state WHERE key = $1 RETURNING value`,
    [KEY],
  )
  if (!row) return null
  return row.value === 'full' ? 'full' : 'incremental'
}
