import { NextResponse } from 'next/server'
import { buildDraft } from '@/lib/notices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get('days')) || 7
  return NextResponse.json(await buildDraft(days))
}
