import { after, NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { listMessages, markRead, partnerReadId, sendMessage } from '@/lib/chat'

// 대화 내용 읽기 · 쓰기. 내가 낀 대화가 아니면 404 다 — id 만 알아도 남의 대화를
// 들여다볼 수 없게 lib/chat.ts 에서 참가자를 확인한다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 푸시 본문에 실리는 길이(200자)보다 넉넉하되, 한 통에 소설을 담지는 못하게 한다.
const MAX_BODY = 2000

export async function GET(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }

  const conversationId = request.nextUrl.searchParams.get('conversationId') ?? ''
  const messages = await listMessages(conversationId, profileId)
  if (!messages) {
    return NextResponse.json({ error: '없는 대화입니다.' }, { status: 404 })
  }

  // 열어서 본 순간 읽은 것으로 본다.
  const [, partnerRead] = await Promise.all([
    markRead(conversationId, profileId),
    partnerReadId(conversationId, profileId),
  ])
  return NextResponse.json({ messages, partnerReadId: partnerRead })
}

export async function POST(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '프로필을 먼저 골라 주세요.' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const conversationId = typeof payload?.conversationId === 'string' ? payload.conversationId : ''
  const body = typeof payload?.body === 'string' ? payload.body.trim() : ''

  if (!conversationId || !body) {
    return NextResponse.json({ error: '보낼 내용을 입력해 주세요.' }, { status: 400 })
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: `${MAX_BODY}자까지 보낼 수 있습니다.` }, { status: 400 })
  }

  const sent = await sendMessage(conversationId, profileId, body)
  if (!sent) {
    return NextResponse.json({ error: '없는 대화입니다.' }, { status: 404 })
  }
  // 앱 푸시는 응답을 보낸 뒤에 한다. 보낸 사람은 저장까지만 기다리면 된다.
  after(() => sent.push().catch((error) => console.error('[chat] 푸시 실패:', error)))
  return NextResponse.json({ message: sent.message })
}
