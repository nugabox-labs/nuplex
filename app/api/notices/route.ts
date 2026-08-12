import { NextResponse } from 'next/server'
import { listNotices } from '@/lib/notices'

// 종 아이콘이 읽는 목록. 열람 세션만 있으면 된다(proxy 가 이미 막고 있다).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ notices: await listNotices() })
}
