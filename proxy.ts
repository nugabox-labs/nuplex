import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE, PROFILE_COOKIE, readProfileValue, verifyAdminValue } from '@/lib/auth/session'

// (Next.js 16 에서 middleware 파일 규약이 proxy 로 바뀌었다.)
//
// 두 겹이다.
//   · 앱 전체 — 프로필. 프로필을 처음 고를 때 그 사람의 가입 이메일을 한 번 확인하는
//     것이 유일한 관문이다. 포스터 이미지(/media/*)도 예외가 아니다 — 라이브러리
//     구성이 그대로 드러나기 때문이다.
//   · /admin — 별도의 관리자 비밀번호.
//
// 프로필 쿠키는 1년짜리다. "나가기" 를 누르기 전까지는 다시 묻지 않는다.

// 앱 셸의 원격 설정은 입장 전에 읽힌다. 셸은 이 응답을 보고 나서야 어느 주소를
// 웹뷰에 띄울지 안다 — 여기에 인증을 걸면 앱이 부팅되지 않는다(docs/APP-INTEGRATION.md).
//
// `/media/avatars` 만 열어 둔다. 프로필 선택 화면이 아직 아무 관문도 통과하지 않은
// 사람에게 아바타를 보여줘야 하기 때문이다. 포스터는 그대로 막힌다.
const PUBLIC_PATHS = [
  '/welcome',
  '/guide',
  // 스토어가 로그인 없이 열리는 주소를 요구한다. 관문 뒤에 두면 심사자가 못 본다.
  '/privacy',
  '/profile',
  '/api/profile',
  '/api/auth/logout',
  '/api/app/config',
  '/media/avatars',
]
const ADMIN_PUBLIC_PATHS = ['/admin/login', '/api/admin/login']

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- 관리자 영역 ---------------------------------------------------------
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin')) {
    const isAdmin = await verifyAdminValue(request.cookies.get(ADMIN_COOKIE)?.value)

    if (matches(pathname, ADMIN_PUBLIC_PATHS)) {
      if (isAdmin && pathname === '/admin/login') {
        return NextResponse.redirect(new URL('/admin/scan', request.url))
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
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)

  if (matches(pathname, PUBLIC_PATHS)) {
    // 이미 들어와 있는데 입장 · 선택 화면으로 오면 홈으로 돌려보낸다.
    if (profileId && (pathname === '/welcome' || pathname === '/profile')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  if (profileId) return NextResponse.next()

  return NextResponse.redirect(withNext(new URL('/welcome', request.url), request))
}

/**
 * 원래 보려던 곳을 `next` 로 달아 준다. 입장 화면이 이 값을 프로필 선택으로
 * 그대로 넘기고, 프로필을 고른 뒤 그리로 간다. 외부 사이트로 튕기지 않도록 경로만 넘긴다.
 *
 * **쿼리를 함께 실어야 한다.** 채팅 푸시의 라우트는 `/?chat=12` 라 경로만 보면 `/` 다 —
 * 경로만으로 판단하면 쿼리가 통째로 버려져, 알림을 탭한 사람이 로그인 뒤 홈으로 간다
 * (docs/CHAT.md §5).
 */
function withNext(destination: URL, request: NextRequest): URL {
  const target = request.nextUrl.pathname + request.nextUrl.search
  if (target !== '/') destination.searchParams.set('next', target)
  return destination
}

export const config = {
  // Next.js 내부 자산과 파비콘 · OG 이미지는 검사하지 않는다(OG 는 외부 미리보기가 읽어야 한다).
  // 입장 화면 배경(/intro/*)도 마찬가지다 — 아직 아무 관문도 통과하지 않은 사람이 보는 그림이다.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|icon-64.png|apple-icon.png|og.png|intro/).*)',
  ],
}
