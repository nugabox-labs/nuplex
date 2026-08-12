import { NextResponse, type NextRequest } from 'next/server'
import { updateProfile } from '@/lib/profiles'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)

  const result = await updateProfile(Number(id), {
    displayName: body?.displayName,
    emailOverride: body?.emailOverride,
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
    sortOrder: typeof body?.sortOrder === 'number' ? body.sortOrder : undefined,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
