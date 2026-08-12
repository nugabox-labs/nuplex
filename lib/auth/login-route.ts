import { NextResponse, type NextRequest } from 'next/server'
import { verifyPassword } from '@/lib/auth/password'
import { cookieName, createSessionValue, maxAge, type SessionScope } from '@/lib/auth/session'

// 열람용 · 관리자용 로그인은 쓰는 해시와 쿠키만 다르고 나머지가 같다. 한 곳에 둔다.

// 비밀번호가 하나뿐이라 무차별 대입이 그대로 통한다. IP 당 시도 횟수를 제한한다.
// 컨테이너 하나짜리 앱이므로 메모리에 둔다 — 재시작하면 초기화되지만 그걸로 충분하다.
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, { count: number; resetAt: number }>()

function tooManyAttempts(key: string): boolean {
  const now = Date.now()
  const record = attempts.get(key)
  if (!record || record.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  record.count += 1
  return record.count > MAX_ATTEMPTS
}

export async function handleLogin(
  request: NextRequest,
  scope: SessionScope,
  hashEnvKey: 'APP_PASSWORD_HASH' | 'ADMIN_PASSWORD_HASH',
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // 범위별로 따로 센다. 열람 시도가 많다고 관리자 로그인이 막히면 안 된다.
  if (tooManyAttempts(`${scope}:${ip}`)) {
    return NextResponse.json(
      { error: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    )
  }

  const body = await request.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''

  const stored = process.env[hashEnvKey]
  if (!stored) {
    return NextResponse.json(
      { error: `서버에 ${hashEnvKey} 가 설정되지 않았습니다.` },
      { status: 500 },
    )
  }

  if (!(await verifyPassword(password, stored))) {
    return NextResponse.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 401 })
  }

  attempts.delete(`${scope}:${ip}`)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(cookieName(scope), await createSessionValue(scope), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAge(scope),
  })
  return response
}
