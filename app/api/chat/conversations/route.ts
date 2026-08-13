import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getOrCreateConversation } from '@/lib/chat'

// 상대를 골랐을 때 부른다. 이미 있는 방이면 그 방을 그대로 돌려준다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const partnerId = Number(body?.partnerId)
  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: '상대를 고르지 않았습니다.' }, { status: 400 })
  }

  const conversationId = await getOrCreateConversation(profileId, partnerId)
  if (!conversationId) {
    return NextResponse.json({ error: '대화를 시작할 수 없는 상대입니다.' }, { status: 400 })
  }
  return NextResponse.json({ conversationId })
}
