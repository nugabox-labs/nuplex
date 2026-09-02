import 'server-only'
import { db, queryOne } from '@/lib/db'

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
const START_GRACE_MS = 20_000

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
