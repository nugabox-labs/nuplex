import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { addHiddenWatched } from '@/lib/profiles'

// "내가 본 작품" 목록에서 감출 작품을 받는다.
// 시청 기록 자체는 건드리지 않는다 — database/0014_hidden_watched.sql
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필이 없습니다.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { ratingKeys?: unknown } | null
  const ratingKeys = Array.isArray(body?.ratingKeys)
    ? body.ratingKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    : []

  if (ratingKeys.length === 0) {
    return NextResponse.json({ error: '고른 항목이 없습니다.' }, { status: 400 })
  }

  await addHiddenWatched(profileId, ratingKeys)
  return NextResponse.json({ ok: true })
}
