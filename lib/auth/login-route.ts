import { NextResponse, type NextRequest } from 'next/server'
import { isSecureRequest } from '@/lib/auth/cookie'
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

export const ADMIN_USERNAME = 'root'

/**
 * 비밀번호를 확인한다.
 *
 * 관리자는 평문(`ADMIN_PASSWORD`)을 먼저 본다 — 자주 안 들어가서 잊지 않도록 그렇게
 * 두기로 했다. 평문이 없으면 예전 방식인 scrypt 해시로 넘어간다.
 * 평문 비교도 상수 시간으로 한다. 길이가 다르면 그 자체가 단서라 길이부터 맞춘다.
 */
async function passwordMatches(
  scope: SessionScope,
  password: string,
  hashEnvKey: 'APP_PASSWORD_HASH' | 'ADMIN_PASSWORD_HASH',
): Promise<boolean> {
  if (scope === 'admin') {
    const plain = process.env.ADMIN_PASSWORD
    if (plain) return timingSafeEquals(password, plain)
  }
  const stored = process.env[hashEnvKey]
  if (!stored) return false
  return verifyPassword(password, stored)
}

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
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

  // 관리자는 아이디도 함께 받는다. 값은 root 하나뿐이고 화면에서 고정돼 있지만,
  // 서버에서도 확인한다 — 화면에서 고정한 값은 언제든 우회할 수 있다.
  if (scope === 'admin') {
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    if (username !== ADMIN_USERNAME) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 맞지 않습니다.' }, { status: 401 })
    }
  }

  if (!(await passwordMatches(scope, password, hashEnvKey))) {
    return NextResponse.json(
      { error: scope === 'admin' ? '아이디 또는 비밀번호가 맞지 않습니다.' : '비밀번호가 맞지 않습니다.' },
      { status: 401 },
    )
  }

  attempts.delete(`${scope}:${ip}`)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(cookieName(scope), await createSessionValue(scope), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: maxAge(scope),
  })
  return response
}
