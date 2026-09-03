import { db, queryOne } from '@/lib/db'

// 라이브러리 스캔의 상태를 담는 곳. 즐겨찾기 · 대기줄 · 이력 셋 다 여기 있다.
//
// 'server-only' 를 걸지 않는다. 대기줄을 실제로 모는 것은 sync 워커라서 이 파일을
// import 해야 한다 — AGENTS §4.

// 스캔 즐겨찾기 — 관리자가 자주 훑는 라이브러리 묶음.
//
// 표를 새로 만들지 않고 sync_state(키 · 값) 에 한 줄로 넣는다. 관리자 한 사람의
// 편의값이라 프로필별로 나눌 이유가 없고, 잃어버려도 체크를 다시 하면 그만이다
// (sync_state 는 백업 대상이 아니다 — AGENTS §2 의 백업 목록을 늘리지 않으려는 선택).

const KEY = 'scan_favorites'

export async function getScanFavorites(): Promise<number[]> {
  const row = await queryOne<{ value: string | null }>(
    `SELECT value FROM sync_state WHERE key = $1`,
    [KEY],
  )
  return (row?.value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
}

export async function setScanFavorites(ids: number[]): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, ids.join(',')],
  )
}

// 스캔 이력 — 언제 무엇을 훑었고 얼마나 걸렸는지.
//
// 이것도 표를 만들지 않고 sync_state 한 줄에 담는다(최근 10건 JSON). 지나간 작업의
// 기록일 뿐이라 잃어버려도 손해가 없고, 백업 대상 목록을 늘리지 않아도 된다 — AGENTS §2.

export interface ScanRun {
  sectionId: number
  title: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'ok' | 'failed'
}

const HISTORY_KEY = 'scan_history'
const HISTORY_LIMIT = 10
// Plex 가 스캔을 잡기까지 몇 초 걸린다. 그 사이에 "안 훑고 있다" 를 끝난 것으로
// 읽으면 모든 이력이 0초가 된다 — scan-admin 의 대기줄이 쓰는 유예와 같은 이유다.
export const START_GRACE_MS = 20_000

async function writeHistory(runs: ScanRun[]): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [HISTORY_KEY, JSON.stringify(runs)],
  )
}

export async function readScanHistory(): Promise<ScanRun[]> {
  const row = await queryOne<{ value: string | null }>(
    `SELECT value FROM sync_state WHERE key = $1`,
    [HISTORY_KEY],
  )
  if (!row?.value) return []
  try {
    const parsed = JSON.parse(row.value)
    // 담긴 것이 더 많아도 보여주는 건 최근 것뿐이다(전에 더 많이 담아 두었을 수 있다).
    return Array.isArray(parsed) ? (parsed as ScanRun[]).slice(0, HISTORY_LIMIT) : []
  } catch {
    // 값이 깨졌으면 이력을 포기한다. 이것 때문에 스캔 화면이 안 뜨면 안 된다.
    return []
  }
}

/** 스캔을 시작했다고 적는다. 끝나는 시각은 아래 reconcile 이 채운다. */
export async function appendScanRun(sectionId: number, title: string, ok: boolean): Promise<void> {
  const now = new Date().toISOString()
  const runs = await readScanHistory()
  runs.unshift({
    sectionId,
    title,
    startedAt: now,
    // 시작 요청부터 실패했으면 그 자리에서 끝난 것이다.
    finishedAt: ok ? null : now,
    status: ok ? 'running' : 'failed',
  })
  await writeHistory(runs.slice(0, HISTORY_LIMIT))
}

/**
 * 한 건을 강제로 닫는다. Plex 가 계속 "훑는 중" 이라고 답하는데도 너무 오래 걸려
 * 일련 작업이 그 하나에 붙잡혀 있을 때만 쓴다 — reconcile 로는 안 닫히는 경우다.
 */
export async function endScanRun(
  sectionId: number,
  startedAt: string,
  status: 'ok' | 'failed',
): Promise<void> {
  const runs = await readScanHistory()
  await writeHistory(
    runs.map((run) =>
      run.sectionId === sectionId && run.startedAt === startedAt && run.status === 'running'
        ? { ...run, finishedAt: new Date().toISOString(), status }
        : run,
    ),
  )
}

/**
 * 진행 중이라고 적힌 이력을 Plex 의 현재 상태와 맞춘다.
 * `scanning` 이 null 이면(Plex 에 못 물어봤으면) 아무것도 손대지 않는다 —
 * 물어보지 못한 것을 "끝났다" 로 읽으면 걸린 시간이 통째로 거짓이 된다.
 */
export async function reconcileScanHistory(scanning: number[] | null): Promise<ScanRun[]> {
  const runs = await readScanHistory()
  if (!scanning) return runs

  const now = Date.now()
  let changed = false
  const next = runs.map((run) => {
    if (run.status !== 'running') return run
    if (scanning.includes(run.sectionId)) return run
    if (now - new Date(run.startedAt).getTime() < START_GRACE_MS) return run
    changed = true
    return { ...run, finishedAt: new Date(now).toISOString(), status: 'ok' as const }
  })

  if (changed) await writeHistory(next)
  return next
}

// 스캔 대기줄 — "대기가 없어질 때까지" 를 하나의 일련 작업으로 본다.
//
// 화면은 여기에 넣기만 하고, 실제로 Plex 를 부르는 것은 sync 워커다(sync/scan.ts).
// 브라우저가 몰던 것을 옮긴 이유는 두 가지다.
//   · 탭을 닫아도 일련 작업이 끝까지 간다 — 끝나면 동기화까지 이어져야 하므로
//   · 시작 유예를 한 곳에서만 센다. 화면과 서버가 서로 다른 유예를 쓰면 Plex 가
//     첫 스캔을 집기도 전에 다음 것을 던지게 된다(실제로 그랬다)
//
// 값은 두 줄이다. `scan_queue` 는 아직 시작 안 한 섹션 id 를 쉼표로 이은 것이고,
// `scan_current` 는 지금 훑는 중인 하나다. **`scan_queue` 행이 있다는 것 자체가
// 일련 작업이 살아 있다는 표식**이다 — 다 비면 워커가 행을 지우고 동기화를 건다.

const QUEUE_KEY = 'scan_queue'
const CURRENT_KEY = 'scan_current'

export interface ScanBatch {
  /** 아직 시작하지 않은 것들 */
  queue: number[]
  /** 지금 Plex 가 훑고 있는 하나 */
  current: { id: number; startedAt: string } | null
}

/** 대기줄 뒤에 붙인다. 진행 중인 일련 작업이 있으면 끊지 않고 이어 붙는다. */
export async function enqueueScans(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const batch = await readScanBatch()
  const known = new Set([...(batch?.queue ?? []), batch?.current?.id])
  const fresh = ids.filter((id) => !known.has(id))
  if (fresh.length === 0) return

  // 읽고 쓰는 사이에 워커가 하나 꺼내 갈 수 있다. 이어 붙이기는 SQL 한 문장으로 해서
  // 그 사이에 낀 변경을 덮어쓰지 않게 한다.
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE
       SET value = concat_ws(',', nullif(sync_state.value, ''), $2), updated_at = now()`,
    [QUEUE_KEY, fresh.join(',')],
  )
}

/** 일련 작업의 현재 모습. 작업이 없으면 null. */
export async function readScanBatch(): Promise<ScanBatch | null> {
  const [queueRow, currentRow] = await Promise.all([
    queryOne<{ value: string | null }>(`SELECT value FROM sync_state WHERE key = $1`, [QUEUE_KEY]),
    queryOne<{ value: string | null }>(`SELECT value FROM sync_state WHERE key = $1`, [CURRENT_KEY]),
  ])
  if (!queueRow) return null

  const queue = (queueRow.value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)

  const [rawId, startedAt] = (currentRow?.value ?? '').split('|')
  const id = Number(rawId)
  return {
    queue,
    current: Number.isInteger(id) && id > 0 && startedAt ? { id, startedAt } : null,
  }
}

/** 일련 작업이 살아 있는지. 동기화가 끼어들지 않게 워커가 매 틱 확인한다. */
export async function scanBatchActive(): Promise<boolean> {
  const row = await queryOne<{ key: string }>(`SELECT key FROM sync_state WHERE key = $1`, [
    QUEUE_KEY,
  ])
  return Boolean(row)
}

/**
 * 맨 앞 하나를 꺼낸다. 남은 것이 없으면 null(행은 그대로 둔다 — 아직 일련 작업 중이다).
 * 화면이 뒤에 붙이는 것과 겹쳐도 잃지 않도록 한 문장 안에서 잠그고 꺼낸다.
 */
export async function takeNextScan(): Promise<number | null> {
  const row = await queryOne<{ head: string }>(
    `WITH cur AS (
       SELECT value AS v FROM sync_state WHERE key = $1 AND value <> '' FOR UPDATE
     )
     UPDATE sync_state
        SET value = substring(cur.v from position(',' in cur.v || ',') + 1), updated_at = now()
       FROM cur
      WHERE sync_state.key = $1
     RETURNING split_part(cur.v, ',', 1) AS head`,
    [QUEUE_KEY],
  )
  const id = Number(row?.head)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function setScanCurrent(id: number): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CURRENT_KEY, `${id}|${new Date().toISOString()}`],
  )
}

export async function clearScanCurrent(): Promise<void> {
  await db.query(`DELETE FROM sync_state WHERE key = $1`, [CURRENT_KEY])
}

/** 일련 작업을 닫는다. 이 행이 사라져야 동기화가 들어올 수 있다. */
export async function endScanBatch(): Promise<void> {
  await db.query(`DELETE FROM sync_state WHERE key IN ($1, $2)`, [QUEUE_KEY, CURRENT_KEY])
}
