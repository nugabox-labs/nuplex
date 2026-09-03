import { queryOne } from '@/lib/db'
import { readPlexEnv, refreshSection, scanningSectionIds } from '@/lib/plex/client'
import {
  START_GRACE_MS,
  appendScanRun,
  clearScanCurrent,
  endScanBatch,
  endScanRun,
  readScanBatch,
  reconcileScanHistory,
  setScanCurrent,
  takeNextScan,
} from '@/lib/scan'
import { requestSync } from '@/lib/sync-request'

// 라이브러리 스캔의 일련 작업을 여기서 몬다.
//
// 관리자가 화면에서 스캔을 걸면 대기줄(lib/scan.ts)에만 쌓인다. 실제로 Plex 를 부르는
// 것은 이 워커다 — 스캔을 미는 동안 진행 상황을 계속 물어봐야 하는데, 그걸 브라우저가
// 하면 탭을 닫는 순간 일련 작업이 끊기기 때문이다.
//
// **"대기가 더 없을 때까지" 가 하나의 일련 작업이다.** 한 번에 하나씩만 훑고, 앞의 것이
// Plex 에서 끝나야 다음이 나간다. 대기줄이 완전히 비면 그 자리에서 동기화를 한 번 건다 —
// 스캔으로 새로 들어온 파일이 곧바로 화면에 올라오게 하려는 것이다.

// Plex 가 스캔 요청을 집기까지 몇 초 걸린다. 그 사이의 "안 훑는 중" 을 끝난 것으로 읽으면
// 첫 스캔이 시작되기도 전에 다음 것을 던지게 된다.
// 한 라이브러리가 이만큼을 넘기면 포기하고 다음으로 넘어간다. 하나가 멈춰 서서 일련 작업
// 전체가 영영 안 끝나는 일을 막는 안전장치다.
const SCAN_TIMEOUT_MS = 2 * 60 * 60 * 1000

async function sectionTitle(id: number): Promise<string> {
  // lib/library.ts 는 'server-only' 라 워커가 import 할 수 없다 — AGENTS §4.
  const row = await queryOne<{ title: string }>(
    `SELECT title FROM library_section WHERE id = $1`,
    [id],
  )
  return row?.title ?? `#${id}`
}

/**
 * 일련 작업을 한 칸 민다. 워커가 주기적으로 부른다.
 * 동기화가 도는 동안에는 부르지 않는다 — 겹쳐서 훑지 않으려는 것이다.
 */
export async function tickScanBatch(): Promise<void> {
  const batch = await readScanBatch()
  if (!batch) return

  const env = readPlexEnv()

  if (batch.current) {
    // 못 물어봤으면(null) 아무 판단도 하지 않는다. 다음 틱에 다시 묻는다 —
    // 물어보지 못한 것을 "끝났다" 로 읽으면 걸린 시간이 통째로 거짓이 된다.
    const scanning = await scanningSectionIds(env).catch(() => null)
    if (!scanning) return
    await reconcileScanHistory(scanning)

    const elapsed = Date.now() - new Date(batch.current.startedAt).getTime()
    if (scanning.includes(batch.current.id)) {
      if (elapsed < SCAN_TIMEOUT_MS) return
      console.warn(`[scan] 섹션 ${batch.current.id} 가 너무 오래 걸립니다. 다음으로 넘어갑니다`)
      await endScanRun(batch.current.id, batch.current.startedAt, 'failed')
    } else if (elapsed < START_GRACE_MS) {
      // Plex 가 아직 집지 않았을 뿐이다.
      return
    }
    await clearScanCurrent()
  }

  const next = await takeNextScan()
  if (next !== null) {
    const title = await sectionTitle(next)
    let ok = true
    try {
      await refreshSection(env, next)
      console.log(`[scan] "${title}" 스캔을 시작했습니다`)
    } catch (error) {
      ok = false
      console.error(`[scan] "${title}" 스캔을 시작하지 못했습니다:`, error)
    }
    await appendScanRun(next, title, ok)
    // 실패한 것은 기다릴 것이 없다. 다음 틱에 곧바로 그다음을 집는다.
    if (ok) await setScanCurrent(next)
    return
  }

  // 대기줄이 비었다 = 일련 작업 끝. 이어서 동기화 한 번.
  await endScanBatch()
  await requestSync('incremental')
  console.log('[scan] 일련 스캔을 마쳤습니다. 이어서 동기화를 겁니다')
}
