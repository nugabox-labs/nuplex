import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

// 동기화가 받아둔 포스터 · 배경을 서빙한다. 파일명에 원본 경로의 해시가 들어 있어서
// 같은 이름이면 같은 이미지다 — 브라우저 캐시를 영구로 걸어도 안전하다.
export const runtime = 'nodejs'

// 경로를 path.join/resolve 로 조립하지 않는다. 번들러가 그걸 보면 프로젝트 전체를
// 추적 대상으로 끌고 들어와 standalone 출력이 통째로 불어난다.
// 대신 세그먼트를 화이트리스트로 검사한다 — 어차피 우리가 만든 파일명뿐이다.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params

  if (
    segments.length === 0 ||
    segments.some((segment) => segment === '..' || !SAFE_SEGMENT.test(segment))
  ) {
    return new NextResponse(null, { status: 400 })
  }

  const root = (process.env.MEDIA_DIR || 'data/media').replace(/\/+$/, '')

  try {
    const file = await readFile(`${root}/${segments.join('/')}`)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
