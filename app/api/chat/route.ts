import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { findAdminPartner, listConversations } from '@/lib/chat'

// 채팅 아이콘이 읽는 목록. 내가 낀 대화만.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }

  const [conversations, admin] = await Promise.all([
    listConversations(profileId),
    // "관리자에게 작품 신청하기" 버튼이 쓴다. 없으면 화면이 버튼을 감춘다.
    findAdminPartner(profileId),
  ])

  return NextResponse.json({
    profileId,
    conversations,
    admin,
    unread: conversations.reduce((sum, c) => sum + c.unread, 0),
  })
}
