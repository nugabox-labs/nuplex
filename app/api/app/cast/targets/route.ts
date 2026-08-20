import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'

// 앱 셸이 "TV에서 시청" 을 띄울 때 부르는 후보 목록.
//
// plex.tv 조회를 서버가 대신하는 이유는 계정 토큰을 앱에 심어 두지 않기 위해서다.
// 셸은 여기서 받은 후보에 실제로 붙어 보고 닿는 것만 사용자에게 보여준다
// (계약: nuplex-app/docs/BRIDGE_CONTRACT.md §7 · PLEX_CAST.md).
//
// ── 알아둘 것 두 가지 ──────────────────────────────────────────────────────
//
// 1. **plex.tv 의 기기 목록은 Plex 계정 단위다.** 여기서 쓰는 토큰의 주인은 서버
//    소유자 계정이므로, 가족이 각자의 Plex 계정으로 로그인한 TV 는 보이지 않는다.
//    프로필마다 다른 TV 를 대상으로 하려면 프로필 ↔ Plex 계정 연결이 먼저다.
//
// 2. **응답에 토큰이 들어간다.** 플레이어에 보내는 재생 명령이 X-Plex-Token 을
//    요구해서다. 프로필 관문 뒤에 있지만, 이 토큰은 Plex 계정 전체 권한을 가진
//    값이라 좋은 상태가 아니다. 프로필별 Plex 계정 연결이 붙으면 각자의 토큰으로
//    바뀌면서 해소된다. 그때까지의 한시적 타협이다.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CastCandidate {
  id: string
  name: string
  uri: string
}

/** 플레이어가 광고하는 연결 주소 중 사설망 것만 고른다. */
function isPrivateAddress(uri: string): boolean {
  const host = uri.replace(/^https?:\/\//, '').split(':')[0]
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

/** `PLEX_PUBLIC_URL` 을 플레이어가 받아먹을 수 있는 셋으로 쪼갠다. */
function parseServerUrl(raw: string): { address: string; port: number; protocol: 'http' | 'https' } | null {
  try {
    const url = new URL(raw)
    const protocol = url.protocol === 'http:' ? 'http' : 'https'
    return {
      address: url.hostname,
      port: url.port ? Number(url.port) : protocol === 'https' ? 443 : 80,
      protocol,
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  // 프로필 관문 뒤다. proxy 가 이미 막지만, 토큰을 돌려주는 경로라 여기서도 확인한다.
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: '입장이 필요합니다.' }, { status: 401 })
  }

  const token = process.env.PLEX_TOKEN
  const clientId = process.env.PLEX_CLIENT_ID
  const serverId = process.env.PLEX_SERVER_ID
  const publicUrl = process.env.PLEX_PUBLIC_URL || process.env.PLEX_BASE_URL || ''

  if (!token || !serverId) {
    // 설정이 없으면 기능이 없는 것으로 보이게 한다. 앱은 빈 목록을 받고 항목을 감춘다.
    return NextResponse.json({ candidates: [], token: '', server: null })
  }

  const server = parseServerUrl(publicUrl)
  if (!server) {
    return NextResponse.json({ candidates: [], token: '', server: null })
  }

  let candidates: CastCandidate[] = []
  try {
    const response = await fetch(
      'https://plex.tv/api/resources?includeHttps=1&includeRelay=1',
      {
        headers: {
          'X-Plex-Token': token,
          ...(clientId ? { 'X-Plex-Client-Identifier': clientId } : {}),
        },
        // 앱의 모달을 붙잡지 않는다. 느리면 그냥 빈 목록이다.
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      },
    )

    if (response.ok) {
      const xml = await response.text()
      candidates = parsePlayers(xml)
    }
  } catch {
    // plex.tv 가 느리거나 죽었다. 빈 목록으로 물러난다 — 캐스트가 안 될 뿐이다.
  }

  return NextResponse.json({
    candidates,
    token,
    server: {
      address: server.address,
      port: server.port,
      protocol: server.protocol,
      machineIdentifier: serverId,
    },
  })
}

/**
 * `<Device provides="...player...">` 중 사설 주소를 가진 것만 후보로 만든다.
 *
 * 정규식으로 뜯는 이유는 응답이 작고 구조가 얕아서다. 여기에 XML 파서를 들이면
 * 의존성만 늘고 얻는 것이 없다.
 */
function parsePlayers(xml: string): CastCandidate[] {
  const out: CastCandidate[] = []

  for (const block of xml.split('<Device ').slice(1)) {
    const provides = block.match(/provides="([^"]*)"/)?.[1] ?? ''
    if (!provides.split(',').includes('player')) continue

    const id = block.match(/clientIdentifier="([^"]*)"/)?.[1] ?? ''
    const name = block.match(/name="([^"]*)"/)?.[1] ?? 'TV'
    if (!id) continue

    // 사설 주소가 있어야 같은 WiFi 에서 닿는다. relay·공인 주소로는 Companion 이
    // 동작하지 않는다 — 플레이어는 사설 주소만 광고한다(PLEX_CAST.md §3).
    const uri = [...block.matchAll(/<Connection[^>]*uri="([^"]*)"/g)]
      .map((m) => m[1])
      .find(isPrivateAddress)
    if (!uri) continue

    out.push({ id, name, uri })
  }

  return out
}
