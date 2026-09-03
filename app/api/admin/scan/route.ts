import { NextResponse, type NextRequest } from 'next/server'
import { getSections } from '@/lib/library'
import {
  enqueueScans,
  getScanFavorites,
  readScanBatch,
  readScanHistory,
  setScanFavorites,
} from '@/lib/scan'

// 라이브러리 파일 스캔. 관리자만 들어온다(proxy 가 /api/admin 을 막는다).
//
// 여기서 Plex 를 부르지 않는다. 스캔을 걸면 대기줄에 쌓이기만 하고, 실제로 Plex 를
// 부르며 진행을 지켜보는 것은 sync 워커다(sync/scan.ts) — 탭을 닫아도 일련 작업이
// 끝까지 가고, 끝나면 동기화까지 이어지게 하려는 것이다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [sections, favorites, batch, history] = await Promise.all([
    getSections(),
    getScanFavorites(),
    readScanBatch(),
    readScanHistory(),
  ])
  return NextResponse.json({
    sections,
    favorites,
    // 지금 훑는 중인 하나와, 그 뒤에 줄 서 있는 것들.
    current: batch?.current?.id ?? null,
    queue: batch?.queue ?? [],
    history,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const ids: number[] = Array.isArray(body?.sectionIds)
    ? body.sectionIds.filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: '스캔할 라이브러리를 고르지 않았습니다.' }, { status: 400 })
  }

  // 진행 중인 일련 작업이 있으면 그 뒤에 붙는다. 끊지 않는다.
  await enqueueScans(ids)
  const batch = await readScanBatch()
  return NextResponse.json({ current: batch?.current?.id ?? null, queue: batch?.queue ?? [] })
}

/** 즐겨찾기 저장 — 자주 스캔하는 라이브러리를 묶어 한 번에 건다. */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const ids: number[] = Array.isArray(body?.favorites)
    ? body.favorites.filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)
    : []
  await setScanFavorites(ids)
  return NextResponse.json({ ok: true, favorites: ids })
}
