import { NextResponse } from 'next/server'
import { deleteNotice } from '@/lib/notices'

export const runtime = 'nodejs'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deleted = await deleteNotice(id)
  return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404 })
}
