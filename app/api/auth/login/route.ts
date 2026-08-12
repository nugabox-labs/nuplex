import type { NextRequest } from 'next/server'
import { handleLogin } from '@/lib/auth/login-route'

// node:crypto(scrypt)를 쓰므로 Edge 기본값이 아닌 Node 런타임이어야 한다.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handleLogin(request, 'viewer', 'APP_PASSWORD_HASH')
}
