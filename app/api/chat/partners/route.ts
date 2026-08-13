import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { listPartners } from '@/lib/chat'

// "메시지 보내기" 에서 고를 상대 목록. 켜져 있는 프로필 중 나를 뺀 전부.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }
  return NextResponse.json({ partners: await listPartners(profileId) })
}
