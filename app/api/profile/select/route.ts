import { NextResponse, type NextRequest } from 'next/server'
import { isSecureRequest } from '@/lib/auth/cookie'
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE_SECONDS,
  PROFILE_COOKIE,
  PROFILE_MAX_AGE_SECONDS,
  createAdminValue,
  createProfileValue,
} from '@/lib/auth/session'
import { getProfile, verifyProfileEmail } from '@/lib/profiles'

export const runtime = 'nodejs'

// 프로필을 처음 고를 때 그 프로필의 가입 이메일을 한 번 확인한다.
// 남이 내 프로필로 들어가 알림을 보는 걸 막는 최소한의 장치다.
// 무차별 대입을 늦추려고 프로필당 시도 횟수를 센다.
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const profileId = Number(body?.profileId)
  const email = typeof body?.email === 'string' ? body.email : ''

  if (!Number.isInteger(profileId) || profileId <= 0) {
    return NextResponse.json({ error: '프로필을 고르지 않았습니다.' }, { status: 400 })
  }

  const profile = await getProfile(profileId)
  if (!profile) {
    return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (tooManyAttempts(`${profileId}:${ip}`)) {
    return NextResponse.json(
      { error: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    )
  }

  if (!(await verifyProfileEmail(profileId, email))) {
    return NextResponse.json({ error: '이메일이 맞지 않습니다.' }, { status: 401 })
  }

  // 관리자 프로필은 이메일만으로 통과시키지 않는다 — 이 프로필로 들어오면 관리자
  // 화면 진입점이 열린다. 열람용 관문과 관리자 비밀번호는 서로 다른 값이어야 한다는
  // 원칙(AGENTS §2)에 따라 `.env` 의 ADMIN_PASSWORD 를 그대로 쓴다.
  if (profile.isPlexAdmin) {
    const expected = process.env.ADMIN_PASSWORD
    const given = typeof body?.adminPassword === 'string' ? body.adminPassword : ''
    if (!expected || given !== expected) {
      return NextResponse.json({ error: '관리자 비밀번호가 맞지 않습니다.' }, { status: 401 })
    }
  }

  attempts.delete(`${profileId}:${ip}`)

  const response = NextResponse.json({ ok: true, profile })
  response.cookies.set(PROFILE_COOKIE, await createProfileValue(profileId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: PROFILE_MAX_AGE_SECONDS,
  })

  // 관리자 프로필은 방금 관리자 비밀번호까지 확인했다. 관리자 화면에서 같은 값을
  // 또 묻지 않도록 여기서 관리자 쿠키도 함께 발급한다. 유효기간은 12시간 그대로다 —
  // 관리자 화면은 프로필보다 짧게 잡아둔 판단을 바꾸지 않는다.
  if (profile.isPlexAdmin) {
    response.cookies.set(ADMIN_COOKIE, await createAdminValue(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(request),
      path: '/',
      maxAge: ADMIN_MAX_AGE_SECONDS,
    })
  }
  return response
}

/** 프로필만 바꾼다(로그아웃과 구분). 다시 고르면 이메일을 또 확인한다. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(PROFILE_COOKIE)
  return response
}
