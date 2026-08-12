import type { NextRequest } from 'next/server'
import { handleLogin } from '@/lib/auth/login-route'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handleLogin(request, 'admin', 'ADMIN_PASSWORD_HASH')
}
