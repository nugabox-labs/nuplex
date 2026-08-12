import { NextResponse, type NextRequest } from 'next/server'
import {
  ADMIN_COOKIE,
  PROFILE_COOKIE,
  SESSION_COOKIE,
  readProfileValue,
  verifySessionValue,
} from '@/lib/auth/session'

// (Next.js 16 에서 middleware 파일 규약이 proxy 로 바뀌었다.)
//
// 두 겹이다.
//   · 앱 전체 — 공통 비밀번호. 포스터 이미지(/media/*)도 예외가 아니다
//     (라이브러리 구성이 그대로 드러나기 때문).
//   · /admin — 별도의 관리자 비밀번호. 공통 비밀번호는 지인에게 공유하는 것이라
//     그걸로 알림까지 보낼 수 있으면 안 된다.
//
// 비밀번호를 통과하면 프로필을 고르게 한다. 알림을 사람별로 보내려면 "지금 누가
// 보고 있는지" 를 알아야 하기 때문이다. 프로필 쿠키는 1년짜리라 한 번만 고르면 된다.

const PUBLIC_PATHS = ['/login', '/api/auth/login']
// 로그인은 됐지만 아직 프로필을 안 고른 상태에서도 열려 있어야 하는 곳.
const PROFILE_PATHS = ['/profile', '/api/profile', '/api/auth/logout', '/media']
const ADMIN_PUBLIC_PATHS = ['/admin/login', '/api/admin/login']

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- 관리자 영역 ---------------------------------------------------------
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin')) {
    const isAdmin = await verifySessionValue(request.cookies.get(ADMIN_COOKIE)?.value, 'admin')

    if (matches(pathname, ADMIN_PUBLIC_PATHS)) {
      if (isAdmin && pathname === '/admin/login') {
        return NextResponse.redirect(new URL('/admin/notices', request.url))
      }
      return NextResponse.next()
    }
    if (isAdmin) return NextResponse.next()

    // API 는 리다이렉트가 아니라 401 로 답한다. 화면 전환이 아니라 fetch 응답이기 때문이다.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  // --- 일반 영역 -----------------------------------------------------------
  const authenticated = await verifySessionValue(
    request.cookies.get(SESSION_COOKIE)?.value,
    'viewer',
  )

  if (matches(pathname, PUBLIC_PATHS)) {
    // 이미 들어와 있는데 로그인 화면으로 오면 홈으로 돌려보낸다.
    if (authenticated && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  if (authenticated) {
    // 프로필을 아직 안 골랐으면 고르는 화면으로 보낸다.
    const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
    if (!profileId && !matches(pathname, PROFILE_PATHS)) {
      return NextResponse.redirect(new URL('/profile', request.url))
    }
    // 이미 골랐는데 선택 화면으로 오면 홈으로 돌려보낸다.
    if (profileId && pathname === '/profile') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  // 로그인 후 원래 보려던 곳으로 돌아간다. 외부 사이트로 튕기지 않도록 경로만 넘긴다.
  if (pathname !== '/') {
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
  }
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Next.js 내부 자산과 파비콘 · OG 이미지는 검사하지 않는다(OG 는 외부 미리보기가 읽어야 한다).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|icon-64.png|apple-icon.png|og.png).*)',
  ],
}
