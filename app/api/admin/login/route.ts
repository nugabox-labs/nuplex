import { NextResponse, type NextRequest } from 'next/server'
import { isSecureRequest } from '@/lib/auth/cookie'
import { ADMIN_COOKIE, ADMIN_MAX_AGE_SECONDS, createAdminValue } from '@/lib/auth/session'

export const runtime = 'nodejs'

// 비밀번호를 받는 곳은 여기 하나뿐이다. 열람은 프로필 이메일이 관문이라
// 비밀번호를 쓰지 않는다(docs/SECURITY.md).

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

const ADMIN_USERNAME = 'root'

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (tooManyAttempts(ip)) {
    return NextResponse.json(
      { error: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    )
  }

  const body = await request.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''
  // 아이디는 root 하나뿐이고 화면에서 고정돼 있지만 서버에서도 확인한다 —
  // 화면에서 고정한 값은 언제든 우회할 수 있다.
  const username = typeof body?.username === 'string' ? body.username.trim() : ''

  // 관리자 비밀번호는 평문(`ADMIN_PASSWORD`)이다. 자주 안 들어가서 잊지 않도록
  // 그렇게 두기로 했다. 비교는 상수 시간으로 한다.
  const plain = process.env.ADMIN_PASSWORD
  if (username !== ADMIN_USERNAME || !plain || !timingSafeEquals(password, plain)) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 맞지 않습니다.' }, { status: 401 })
  }

  attempts.delete(ip)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, await createAdminValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: ADMIN_MAX_AGE_SECONDS,
  })
  return response
}
