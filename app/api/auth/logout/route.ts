import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, SESSION_COOKIE } from '@/lib/auth/session'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  // 나갈 때는 관리자 세션도 같이 정리한다.
  response.cookies.delete(SESSION_COOKIE)
  response.cookies.delete(ADMIN_COOKIE)
  return response
}
