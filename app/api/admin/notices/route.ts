import { NextResponse, type NextRequest } from 'next/server'
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

  if (!title || !text) {
    return NextResponse.json({ error: '제목과 내용을 모두 입력해 주세요.' }, { status: 400 })
  }
  return NextResponse.json({ notice: await createNotice(title, text) })
}
