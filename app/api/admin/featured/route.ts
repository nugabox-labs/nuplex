import { NextResponse, type NextRequest } from 'next/server'
import { listShowsForAdmin, setFeatured } from '@/lib/library'

// 연재 중인 시리즈 — 관리자가 체크하면 홈 최상단 줄에 나온다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ shows: await listShowsForAdmin() })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const ratingKey = typeof body?.ratingKey === 'string' ? body.ratingKey : ''
  const featured = body?.featured === true
  const kind = body?.kind === 'season' ? 'season' : 'show'

  if (!ratingKey) {
    return NextResponse.json({ error: '작품을 고르지 않았습니다.' }, { status: 400 })
  }

  await setFeatured(ratingKey, featured, kind)
  return NextResponse.json({ ok: true })
}
