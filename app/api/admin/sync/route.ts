import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { readSyncRequest, requestSync } from '@/lib/sync-request'

// 수동 동기화. 관리자만 들어온다(proxy 가 /api/admin 을 막는다).
//
// 여기서 Plex 를 부르지 않는다. 동기화는 sync 워커의 일이고(AGENTS §2), 이 라우트는
// "지금 한 번 돌려 달라" 는 쪽지를 남기고 워커가 남긴 실행 이력을 읽어 줄 뿐이다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Run {
  kind: string
  status: string
  startedAt: Date
  finishedAt: Date | null
  itemsUpserted: number
  episodesUpserted: number
  itemsDeleted: number
  error: string | null
}

const SELECT = `SELECT kind, status, started_at AS "startedAt", finished_at AS "finishedAt",
       items_upserted AS "itemsUpserted", episodes_upserted AS "episodesUpserted",
       items_deleted AS "itemsDeleted", error
  FROM sync_run`

export async function GET() {
  const [current, last, pending] = await Promise.all([
    queryOne<Run>(`${SELECT} WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`),
    queryOne<Run>(`${SELECT} WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`),
    readSyncRequest(),
  ])
  return NextResponse.json({ current, last, pending })
}

export async function POST() {
  // 종류는 증분 하나다. 전체 훑기는 몇 시간짜리라 버튼으로 부를 일이 아니다(매일 04:05 에 돈다).
  await requestSync('incremental')
  return NextResponse.json({ ok: true })
}
