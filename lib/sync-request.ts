import { db, queryOne } from '@/lib/db'

// 수동 동기화 요청 — 관리자 화면(web)과 sync 워커 사이에 놓는 쪽지 한 장.
//
// web 은 Plex 를 부르지 못한다(AGENTS §2 · 예외는 라이브러리 스캔 하나뿐). 그래서 버튼은
// sync_state 에 "지금 한 번 돌려 달라" 만 적고, 워커가 주기적으로 그걸 집어 간다.
// 표를 새로 만들지 않는 이유는 scan_favorites 와 같다 — 잃어버려도 다시 누르면 그만이다.
//
// 'server-only' 를 걸지 않는다. 워커가 import 해야 한다 — AGENTS §4.

export type SyncRequestKind = 'incremental' | 'full'
/** 무엇이 이 요청을 남겼는지. 이력의 라벨(수동 · 스캔)이 여기서 나온다. */
export type SyncTrigger = 'manual' | 'scan'

const KEY = 'sync_request'

export interface SyncRequest {
  kind: SyncRequestKind
  trigger: SyncTrigger
}

/**
 * 화면 · 스캔 일련 작업이 부른다. 이미 요청이 있으면 덮어쓴다 —
 * 스캔 중에 버튼을 눌러 두었다면 스캔이 끝나며 남기는 요청과 하나로 합쳐진다.
 */
export async function requestSync(kind: SyncRequestKind, trigger: SyncTrigger): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, `${kind}:${trigger}`],
  )
}

function parse(value: string): SyncRequest {
  const [kind, trigger] = value.split(':')
  return {
    kind: kind === 'full' ? 'full' : 'incremental',
    // 이 필드가 없던 시절에 남은 쪽지는 버튼으로 남긴 것뿐이다.
    trigger: trigger === 'scan' ? 'scan' : 'manual',
  }
}

/** 아직 워커가 안 집어 간 요청. 화면에 "대기 중" 을 보여주려고 읽는다. */
export async function readSyncRequest(): Promise<(SyncRequest & { requestedAt: Date }) | null> {
  const row = await queryOne<{ value: string; requestedAt: Date }>(
    `SELECT value, updated_at AS "requestedAt" FROM sync_state WHERE key = $1`,
    [KEY],
  )
  if (!row) return null
  return { ...parse(row.value), requestedAt: row.requestedAt }
}

/** 워커가 부른다. 읽는 즉시 지운다 — 같은 요청으로 두 번 돌지 않게. */
export async function takeSyncRequest(): Promise<SyncRequest | null> {
  const row = await queryOne<{ value: string }>(
    `DELETE FROM sync_state WHERE key = $1 RETURNING value`,
    [KEY],
  )
  return row ? parse(row.value) : null
}
