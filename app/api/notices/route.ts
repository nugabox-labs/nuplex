import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { listNoticesFor } from '@/lib/notices'

// 종 아이콘이 읽는 목록. 내 프로필이 대상인 것과 전체 발송분만 돌려준다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  return NextResponse.json({ notices: await listNoticesFor(profileId) })
}
