import { NextResponse, type NextRequest } from 'next/server'
import { deleteNotice, updateNotice } from '@/lib/notices'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await request.json().catch(() => null)
  const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
  const text = typeof payload?.body === 'string' ? payload.body.trim() : ''
  // 빈 배열이면 전체 공개다.
  const targets: number[] = Array.isArray(payload?.targetProfileIds)
    ? payload.targetProfileIds.filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)
    : []

  if (!title || !text) {
    return NextResponse.json({ error: '제목과 내용을 모두 입력해 주세요.' }, { status: 400 })
  }

  // 고칠 때는 푸시를 다시 보내지 않는다. 같은 알림이 두 번 울리는 쪽이 더 나쁘다.
  const notice = await updateNotice(id, title, text, targets)
  return notice
    ? NextResponse.json({ notice })
    : NextResponse.json({ error: '알림을 찾지 못했습니다.' }, { status: 404 })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deleted = await deleteNotice(id)
  return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404 })
}
