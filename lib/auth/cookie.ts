import type { NextRequest } from 'next/server'

/**
 * 이 요청이 HTTPS 로 들어왔는가.
 *
 * `NODE_ENV === 'production'` 으로 판단하면 안 된다. 그 값은 Docker 이미지에 박혀
 * 있어서 로컬이나 LAN 에서 http 로 접속할 때도 참이 되고, 그러면 쿠키에 Secure 가
 * 붙어 브라우저가 저장을 거부한다. 로그인은 200 인데 화면은 로그인으로 되돌아오는,
 * 원인을 찾기 어려운 증상이 된다(실제로 겪음).
 *
 * 운영에서는 NAS 역방향 프록시가 x-forwarded-proto 를 붙여준다.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')
  if (forwarded) return forwarded.split(',')[0].trim() === 'https'
  return request.nextUrl.protocol === 'https:'
}
