import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 입장 · 프로필 선택을 마친 뒤 갈 곳(`?next=`)을 추린다.
 *
 * 채팅 푸시(`/?chat=12`)를 이어가려고 둔 통로라, 여기로 들어온 값을 그대로 이동
 * 대상으로 쓴다. 두 가지를 막는다.
 *  · 외부 주소(`//evil.com`)로 튕기지 않게 내부 경로만 받는다.
 *  · 입장 흐름 자신(`/welcome` · `/profile`)이나 없어진 옛 경로(`/login`)를 걸러낸다 —
 *    안 그러면 옛 북마크의 `/login` 이 이 통로를 타고 끝까지 전달돼 404 로 샌다.
 * 통과하지 못하면 홈(`/`)으로 보낸다.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  const path = next.split('?')[0]
  if (path === '/login' || path === '/welcome' || path === '/profile') return '/'
  return next
}

/**
 * 요청이 앱 셸(webview) 안에서 온 것인지 판별한다. 앱은 UA 에 접미사를 붙인다
 * (`docs/BRIDGE_CONTRACT.md` §2). 공백 개수가 아니라 정규식으로 파싱할 것 —
 * Capacitor 8 에서 공백 처리 동작이 바뀐 이력이 있다.
 */
export function isNuplexApp(userAgent: string | null | undefined): boolean {
  return !!userAgent && /NuplexApp \((ios|android); bridge\/\d+\)/.test(userAgent)
}
