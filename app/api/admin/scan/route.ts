import { NextResponse, type NextRequest } from 'next/server'
import { getSections } from '@/lib/library'
import { readPlexEnv, refreshSection, scanningSectionIds } from '@/lib/plex/client'
import {
  appendScanRun,
  getScanFavorites,
  reconcileScanHistory,
  setScanFavorites,
} from '@/lib/scan'

// 라이브러리 파일 스캔. 관리자만 들어온다(proxy 가 /api/admin 을 막는다).
//
// 여기서만 web 이 Plex 를 직접 호출한다. 화면을 그리는 길이 아니라 관리자가 버튼을
// 누를 때만 나가는 호출이라, "화면이 Plex 를 기다리지 않는다" 는 원칙은 지켜진다 —
// AGENTS §2 에 예외로 적어 두었다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [sections, favorites] = await Promise.all([getSections(), getScanFavorites()])
  // Plex 가 지금 훑고 있는 것. 못 물어봐도 화면은 떠야 한다.
  // 못 물어본 것(null)과 아무것도 안 훑는 것([])은 다르다 — 이력의 "끝난 시각" 이 여기에 달려 있다.
  const scanning = await scanningSectionIds(readPlexEnv()).catch(() => null)
  // 이력이 끝나는 시점을 알려줄 사람이 따로 없다. 이 조회가 올 때마다 맞춘다.
  const history = await reconcileScanHistory(scanning)
  return NextResponse.json({ sections, favorites, scanning: scanning ?? [], history })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const ids: number[] = Array.isArray(body?.sectionIds)
    ? body.sectionIds.filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: '스캔할 라이브러리를 고르지 않았습니다.' }, { status: 400 })
  }

  const env = readPlexEnv()
  const sections = await getSections()
  const started: number[] = []
  const failed: number[] = []

  // 하나씩 순서대로 건다. Plex 는 요청을 즉시 받고 뒤에서 훑으므로 오래 걸리지 않는다.
  // 여러 개를 한꺼번에 던지면 NAS 디스크가 동시에 여러 갈래로 긁힌다.
  for (const id of ids) {
    let ok = true
    try {
      await refreshSection(env, id)
      started.push(id)
    } catch {
      ok = false
      failed.push(id)
    }
    const title = sections.find((section) => section.id === id)?.title ?? `#${id}`
    await appendScanRun(id, title, ok)
  }

  return NextResponse.json({ started, failed })
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
