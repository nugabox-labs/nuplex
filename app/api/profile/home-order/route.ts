import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getHomeLayout, setHomeLayout } from '@/lib/profiles'

// 홈 화면 배치(줄 차례 · 숨긴 줄). 프로필에 붙어 있어 기기를 옮겨도 따라간다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : []
}

export async function GET(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }
  return NextResponse.json(await getHomeLayout(profileId))
}

export async function PUT(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  // 둘 다 빈 배열이면 기본 배치로 되돌린다.
  const order = stringList(body?.order)
  const hidden = stringList(body?.hidden)

  await setHomeLayout(profileId, { order, hidden })
  return NextResponse.json({ ok: true, order: order.length > 0 ? order : null, hidden })
}
