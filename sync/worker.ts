import cron from 'node-cron'
import { queryOne } from '@/lib/db'
import { runSync, type SyncKind } from './run'

// 상주 워커. 이 컨테이너만 Plex 토큰을 쥔다.
//
//   증분 — 기본 30분마다 (SYNC_INCREMENTAL_CRON)
//   전체 — 기본 매일 04:05 KST (SYNC_FULL_CRON)
//
// 기동 시 성공 이력이 하나도 없으면 곧바로 전체 동기화를 한 번 돌린다.
// 최초 배포 후 사람이 따로 뭘 치지 않아도 화면이 채워지게 하려는 것이다.

const TIMEZONE = process.env.TZ || 'Asia/Seoul'

// 두 스케줄이 겹치면 같은 항목에 동시에 쓰게 된다. 한 번에 하나만 돌린다.
let running = false
// 겹쳐서 못 돈 전체 훑기는 버리지 않고 적어 둔다. 04:00 정각은 30분 증분과 부딪히는데,
// 그때 그냥 건너뛰면 그날 삭제 판정이 통째로 사라진다 — Plex 에서 지운 작품이 화면에
// 영영 남아 있게 된다(실제로 일주일 넘게 그랬다). 증분은 30분 뒤에 또 오니 버려도 된다.
let fullPending = false

async function safeRun(kind: SyncKind) {
  if (running) {
    if (kind === 'full') {
      fullPending = true
      console.log('[sync] full 미룸 — 이전 동기화가 끝나는 대로 이어서 돈다')
    } else {
      console.log(`[sync] ${kind} 건너뜀 — 이전 동기화가 아직 진행 중`)
    }
    return
  }
  running = true
  try {
    const result = await runSync(kind)
    console.log(
      `[sync] 완료 (${result.kind}) — 항목 ${result.itemsUpserted}건 · ` +
        `에피소드 ${result.episodesUpserted}건 · 컬렉션 ${result.collectionsUpserted}개 · ` +
        `사용자 ${result.usersUpserted}명 · 시청 기록 ${result.historyUpserted}건 · ` +
        `이미지 ${result.imagesSaved}장 · ` +
        `삭제 ${result.itemsDeleted}건`,
    )
  } catch (error) {
    // 던지지 않는다. 한 번 실패해도 워커는 살아 있어야 다음 주기에 다시 시도한다.
    console.error(`[sync] ${kind} 실패:`, error)
  } finally {
    running = false
  }

  if (kind !== 'full' && fullPending) {
    fullPending = false
    await safeRun('full')
  }
}

async function main() {
  const incrementalCron = process.env.SYNC_INCREMENTAL_CRON || '*/30 * * * *'
  // 04:00 정각이 아니라 04:05 다. 정각은 30분 증분과 매번 부딪힌다 — 위 fullPending 이
  // 받아 주긴 하지만, 애초에 안 부딪히게 두는 편이 낫다.
  const fullCron = process.env.SYNC_FULL_CRON || '5 4 * * *'

  cron.schedule(incrementalCron, () => void safeRun('incremental'), { timezone: TIMEZONE })
  cron.schedule(fullCron, () => void safeRun('full'), { timezone: TIMEZONE })

  console.log(`[sync] 워커 시작 — 증분 "${incrementalCron}" · 전체 "${fullCron}" (${TIMEZONE})`)

  const succeeded = await queryOne<{ id: string }>(
    `SELECT id FROM sync_run WHERE status = 'ok' LIMIT 1`,
  )
  if (!succeeded) {
    console.log('[sync] 성공 이력이 없습니다. 최초 전체 동기화를 시작합니다.')
    // 최초 채우기는 몇 시간짜리라 중간에 한 번 끊기면 다음 주기(30분)까지 놀게 된다.
    // 커서가 남아 있으니 이어서 하면 되고, 끝날 때까지 붙잡고 있는다.
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await safeRun('full')
      const done = await queryOne<{ id: string }>(
        `SELECT id FROM sync_run WHERE status = 'ok' LIMIT 1`,
      )
      if (done) break
      console.log(`[sync] 최초 동기화가 끝나지 않았습니다. 1분 뒤 이어서 진행합니다 (${attempt}회차)`)
      await new Promise((resolve) => setTimeout(resolve, 60_000))
    }
  }
}

main().catch((error) => {
  console.error('[sync] 워커를 시작하지 못했습니다:', error)
  process.exit(1)
})
