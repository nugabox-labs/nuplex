import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, PROFILE_COOKIE } from '@/lib/auth/session'

// "나가기". 프로필 쿠키가 곧 관문이라 이걸 지우면 다시 이메일을 확인해야 들어온다.
export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(PROFILE_COOKIE)
  // 나갈 때는 관리자 세션도 같이 정리한다.
  response.cookies.delete(ADMIN_COOKIE)
  return response
}
