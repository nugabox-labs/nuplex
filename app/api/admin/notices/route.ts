import { NextResponse, type NextRequest } from 'next/server'
import { deliverNotice } from '@/lib/devices'
import { createNotice, listNotices } from '@/lib/notices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ notices: await listNotices(100) })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  // 빈 배열이면 전체 발송이다.
  const targets: number[] = Array.isArray(body?.targetProfileIds)
    ? body.targetProfileIds.filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)
    : []

  if (!title || !text) {
    return NextResponse.json({ error: '제목과 내용을 모두 입력해 주세요.' }, { status: 400 })
  }

  const notice = await createNotice(title, text, targets)
  // 웹 알림은 만든 즉시 보이고, 푸시는 여기서 나간다.
  // 자격증명이 없으면 대기만 쌓인다 — 나중에 키를 넣고 다시 보내면 그대로 나간다.
  const delivery = await deliverNotice(notice.id)

  return NextResponse.json({ notice, delivery })
}
