import { NextResponse } from 'next/server'
import { listAllProfiles } from '@/lib/profiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ profiles: await listAllProfiles() })
}
