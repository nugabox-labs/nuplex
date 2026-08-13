// Plex Media Server API 클라이언트.
//
// 이 파일은 sync 워커에서만 쓴다. web 컨테이너는 Plex 를 호출하지 않는다 —
// 화면은 전부 DB 와 로컬 이미지 파일만 읽는다.
//
// Plex 는 Accept 헤더가 없으면 XML 을 준다. 항상 application/json 을 요구한다.
// plex.tv 쪽 API 는 X-Plex-Client-Identifier 가 없으면 거절한다. 서버 직접 호출엔
// 필수는 아니지만 세션이 앱 단위로 묶이도록 같이 보낸다.

export interface PlexEnv {
  baseUrl: string
  token: string
  clientId: string
}

export function readPlexEnv(): PlexEnv {
  const baseUrl = process.env.PLEX_BASE_URL
  const token = process.env.PLEX_TOKEN
  const clientId = process.env.PLEX_CLIENT_ID
  if (!baseUrl || !token || !clientId) {
    throw new Error('PLEX_BASE_URL · PLEX_TOKEN · PLEX_CLIENT_ID 를 .env 에 설정해야 합니다.')
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token, clientId }
}

/**
 * 일시적인 실패를 몇 번 다시 시도한다.
 *
 * NAS 에서 컨테이너의 DNS 가 가끔 `EAI_AGAIN` 을 던지는데, 그 한 번 때문에 동기화
 * 전체가 죽고 있었다(실측: 300편짜리 섹션 250번째에서 죽고, 다음 실행이 200부터
 * 다시 시작해 영영 못 넘어감). 네트워크 오류와 5xx · 429 만 다시 시도한다 —
 * 404 같은 건 다시 해도 같다.
 */
async function withRetry<T>(label: string, task: () => Promise<T>): Promise<T> {
  const delays = [1000, 3000, 9000, 20000]
  let lastError: unknown

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (error instanceof PlexHttpError && !error.retryable) throw error
      if (attempt === delays.length) break

      const wait = delays[attempt]
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`[sync] ${label} 실패 — ${Math.round(wait / 1000)}초 뒤 재시도 (${reason})`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}

class PlexHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

/** Plex 응답의 MediaContainer 한 겹을 벗겨 돌려준다. */
export async function plexGet<T = any>(
  env: PlexEnv,
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  // URLSearchParams 를 쓰면 안 된다. Plex 의 필터 문법은 비교 연산자가 파라미터 이름에
  // 붙는 형태(`updatedAt>=123`)인데, `>=` 가 퍼센트 인코딩되면 Plex 는 그 필터를 조용히
  // 무시하고 전체를 돌려준다(실측: 716건 → 필터 무시, 원문 그대로 보내면 3건).
  // 값만 인코딩하고 이름은 그대로 붙인다.
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')
  const url = env.baseUrl + path + (query ? `?${query}` : '')

  return withRetry(`Plex ${path}`, async () => {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': env.token,
        'X-Plex-Client-Identifier': env.clientId,
        'X-Plex-Product': 'NUPLEX',
        'X-Plex-Version': '0.1.0',
      },
      // 라이브러리가 크면 응답이 느리다. 넉넉히 준다.
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      throw new PlexHttpError(
        `Plex ${path} 요청 실패 (${res.status} ${res.statusText})`,
        res.status === 429 || res.status >= 500,
      )
    }
    const json = await res.json()
    return json?.MediaContainer as T
  })
}

/** 이미지 내려받기도 같은 재시도를 태운다. sync/images.ts 에서 쓴다. */
export function fetchWithRetry(label: string, url: string, init: RequestInit): Promise<Response> {
  return withRetry(label, async () => {
    const res = await fetch(url, init)
    if (!res.ok) {
      throw new PlexHttpError(
        `${label} 실패 (${res.status})`,
        res.status === 429 || res.status >= 500,
      )
    }
    return res
  })
}

/**
 * 동기화 · 화면에서 뺄 섹션 id. 음악 · 가족처럼 카탈로그에 안 어울리는 분류다.
 *
 * 이 함수는 sync 워커(순수 Node)와 웹 양쪽에서 쓰인다. 그래서 'server-only' 가 걸린
 * lib/library.ts 가 아니라 여기에 둔다 — 워커가 그 모듈을 import 하면 곧바로 죽는다.
 */
export function excludedSectionIds(): number[] {
  return (process.env.EXCLUDED_SECTION_IDS ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

// --- 사용자 --------------------------------------------------------------
// 한 곳으로는 전원을 못 모은다. 세 곳을 계정 id 로 합쳐야 이름 · 이메일 · 아바타가 다 찬다.
//
//   plex.tv/api/v2/home/users  Home 사용자. 이메일 · 아바타 있음
//   plex.tv/api/users (XML)    공유 친구.   이메일 · 아바타 있음
//   <PMS>/accounts             서버 접속 이력. 이름만 있음(아바타 없음)
//
// 실측(2026-08-12): Home 9 + 친구 16 + 서버 22 → 합쳐서 23명, 아바타 17명.

export interface PlexUser {
  id: number
  name: string
  username: string | null
  email: string | null
  thumb: string | null
  isHome: boolean
  isFriend: boolean
  isServer: boolean
  isAdmin: boolean
}

/** XML 속성을 뽑는다. plex.tv 의 친구 목록은 아직 XML 만 준다. */
function parseXmlUsers(xml: string): Record<string, string>[] {
  return [...xml.matchAll(/<User\s([^>]*?)\/?>/g)].map((match) => {
    const attrs: Record<string, string> = {}
    for (const kv of match[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[kv[1]] = kv[2]
    return attrs
  })
}

function emptyToNull(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

export async function fetchPlexUsers(env: PlexEnv): Promise<PlexUser[]> {
  const headers = {
    'X-Plex-Token': env.token,
    'X-Plex-Client-Identifier': env.clientId,
    'X-Plex-Product': 'NUPLEX',
  }
  const merged = new Map<number, PlexUser>()

  const put = (id: number, patch: Partial<PlexUser> & { name?: string }) => {
    const existing = merged.get(id)
    if (existing) {
      // 먼저 채워진 값을 유지한다 — Home · 친구 쪽이 서버 계정보다 정보가 많다.
      existing.name = existing.name || patch.name || ''
      existing.username ??= patch.username ?? null
      existing.email ??= patch.email ?? null
      existing.thumb ??= patch.thumb ?? null
      existing.isHome ||= patch.isHome ?? false
      existing.isFriend ||= patch.isFriend ?? false
      existing.isServer ||= patch.isServer ?? false
      existing.isAdmin ||= patch.isAdmin ?? false
      return
    }
    merged.set(id, {
      id,
      name: patch.name ?? '',
      username: patch.username ?? null,
      email: patch.email ?? null,
      thumb: patch.thumb ?? null,
      isHome: patch.isHome ?? false,
      isFriend: patch.isFriend ?? false,
      isServer: patch.isServer ?? false,
      isAdmin: patch.isAdmin ?? false,
    })
  }

  // 1) Home 사용자
  const home = await withRetry('plex.tv home/users', async () => {
    const res = await fetch('https://plex.tv/api/v2/home/users', {
      headers: { ...headers, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new PlexHttpError(`home/users (${res.status})`, res.status >= 500)
    return res.json()
  })
  for (const u of home?.users ?? []) {
    put(Number(u.id), {
      name: emptyToNull(u.title) ?? emptyToNull(u.friendlyName) ?? emptyToNull(u.username) ?? '',
      username: emptyToNull(u.username),
      email: emptyToNull(u.email),
      thumb: emptyToNull(u.thumb),
      isHome: true,
      isAdmin: Boolean(u.admin),
    })
  }

  // 2) 공유 친구 (XML)
  const friendsXml = await withRetry('plex.tv users', async () => {
    const res = await fetch('https://plex.tv/api/users', {
      headers: { ...headers, Accept: 'application/xml' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new PlexHttpError(`api/users (${res.status})`, res.status >= 500)
    return res.text()
  })
  for (const f of parseXmlUsers(friendsXml)) {
    const id = Number(f.id)
    if (!Number.isFinite(id)) continue
    put(id, {
      name: emptyToNull(f.title) ?? emptyToNull(f.username) ?? '',
      username: emptyToNull(f.username),
      email: emptyToNull(f.email),
      thumb: emptyToNull(f.thumb),
      isFriend: true,
    })
  }

  // 3) 서버 접속 계정. id 0 · 1 은 시스템 계정이라 뺀다.
  const accounts = await plexGet(env, '/accounts')
  for (const a of accounts?.Account ?? []) {
    const id = Number(a.id)
    if (!Number.isFinite(id) || id <= 1) continue
    put(id, { name: emptyToNull(a.name) ?? '', isServer: true })
  }

  return [...merged.values()].filter((user) => user.name.length > 0)
}

export interface PlexSection {
  key: string
  title: string
  type: string
}

export async function fetchSections(env: PlexEnv): Promise<PlexSection[]> {
  const container = await plexGet(env, '/library/sections')
  const directories: any[] = container?.Directory ?? []
  return directories
    .filter((d) => d.type === 'movie' || d.type === 'show')
    .map((d) => ({ key: String(d.key), title: String(d.title), type: String(d.type) }))
}

const PAGE_SIZE = 200

/**
 * 섹션의 항목을 페이지 단위로 흘려보낸다. 라이브러리가 수만 건이어도 메모리에
 * 전부 올리지 않는다. `updatedSince` 를 주면 그 이후 변경분만 받는다(증분 동기화).
 *
 * `startAt` 은 재개용이다 — 중간에 죽어도 다음 실행이 그 위치부터 이어받는다.
 */
export async function* iterateSectionItems(
  env: PlexEnv,
  sectionKey: string,
  options: { updatedSince?: number; startAt?: number } = {},
): AsyncGenerator<{ offset: number; items: any[]; totalSize: number }> {
  let offset = options.startAt ?? 0

  while (true) {
    const params: Record<string, string | number> = {
      'X-Plex-Container-Start': offset,
      'X-Plex-Container-Size': PAGE_SIZE,
      includeGuids: 1,
    }
    // Plex 의 필터 문법. 비교 연산자가 파라미터 이름에 붙어 `updatedAt>=123` 이 된다.
    // 이름이 `updatedAt>` 인 이유는 plexGet 이 `이름=값` 으로 잇기 때문이다.
    if (options.updatedSince) params['updatedAt>'] = options.updatedSince

    const container = await plexGet(env, `/library/sections/${sectionKey}/all`, params)
    const items: any[] = container?.Metadata ?? []
    const totalSize: number = container?.totalSize ?? container?.size ?? items.length

    if (items.length === 0) return
    yield { offset, items, totalSize }

    offset += items.length
    if (offset >= totalSize) return
  }
}

/**
 * 시청 기록. 관리자 토큰 하나로 **모든 공유 사용자의 기록**이 한 번에 나온다
 * (항목마다 accountID 가 붙어 있다).
 *
 * 여기서 재생 위치(viewOffset)는 못 얻는다. `/library/onDeck` 은 accountID 를 조용히
 * 무시하고 관리자 본인의 이어보기를 돌려주며(실측), 남의 토큰은 공유 친구에게서
 * 얻을 수 없다. 홈의 "이어서 보기" 를 다음 화 방식으로 만든 이유다.
 *
 * `viewedSince` 를 주면 그 시각 이후만 받는다. 필터 문법은 섹션 조회와 같다 —
 * 비교 연산자가 파라미터 이름에 붙는다(실측: 전체 1,972건 → 필터 32건).
 */
export async function fetchWatchHistory(
  env: PlexEnv,
  viewedSince?: number,
): Promise<any[]> {
  const all: any[] = []
  let offset = 0

  while (true) {
    const params: Record<string, string | number> = {
      'X-Plex-Container-Start': offset,
      'X-Plex-Container-Size': PAGE_SIZE,
      sort: 'viewedAt:asc',
    }
    if (viewedSince) params['viewedAt>'] = viewedSince

    const container = await plexGet(env, '/status/sessions/history/all', params)
    const items: any[] = container?.Metadata ?? []
    const totalSize: number = container?.totalSize ?? container?.size ?? items.length

    if (items.length === 0) return all
    all.push(...items)

    offset += items.length
    if (offset >= totalSize) return all
  }
}

/** 섹션에 속한 컬렉션(사람이 Plex 에서 직접 묶은 시리즈 모음) 목록. */
export async function fetchCollections(env: PlexEnv, sectionKey: string): Promise<any[]> {
  const container = await plexGet(env, `/library/sections/${sectionKey}/collections`)
  return container?.Metadata ?? []
}

/**
 * 컬렉션에 속한 작품들. Plex 가 준 순서(대개 개봉순)를 그대로 쓴다.
 *
 * 소속은 반드시 이 방향으로만 채운다. 작품 상세의 `Collection` 필드가 주는 id 는
 * 컬렉션의 ratingKey 가 아니라 별개의 태그 id 라서(실측: 컬렉션 82755 ↔ 태그 100432),
 * 그걸로 맞추려 하면 아무것도 안 붙는다.
 */
export async function fetchCollectionChildren(
  env: PlexEnv,
  collectionRatingKey: string,
): Promise<any[]> {
  const container = await plexGet(env, `/library/metadata/${collectionRatingKey}/children`, {
    'X-Plex-Container-Start': 0,
    'X-Plex-Container-Size': 1000,
  })
  return container?.Metadata ?? []
}

/** 출연진 · 감독 · 각본까지 담긴 단일 항목 상세. */
export async function fetchItemDetail(env: PlexEnv, ratingKey: string): Promise<any | null> {
  const container = await plexGet(env, `/library/metadata/${ratingKey}`)
  return container?.Metadata?.[0] ?? null
}

/** 시리즈의 시즌 목록. */
export async function fetchSeasons(env: PlexEnv, showRatingKey: string): Promise<any[]> {
  const container = await plexGet(env, `/library/metadata/${showRatingKey}/children`)
  // Metadata 에 시즌이 들어오지만, "모두 보기" 같은 가짜 항목이 섞일 수 있다.
  return (container?.Metadata ?? []).filter((m: any) => m.type === 'season')
}

/**
 * 시리즈의 전체 에피소드를 한 번에 받는다.
 * 시즌마다 따로 호출하지 않는 것이 중요하다 — 드라마가 많으면 호출 수가 폭증한다.
 */
export async function fetchAllEpisodes(env: PlexEnv, showRatingKey: string): Promise<any[]> {
  const container = await plexGet(env, `/library/metadata/${showRatingKey}/allLeaves`, {
    'X-Plex-Container-Start': 0,
    'X-Plex-Container-Size': 5000,
  })
  return container?.Metadata ?? []
}

/**
 * 이미지 다운로드 URL. Plex 의 사진 트랜스코더를 거쳐 필요한 크기로만 받는다.
 * 원본을 그대로 받으면 수천 장에서 용량이 몇 GB 단위로 뛴다.
 */
export function imageUrl(
  env: PlexEnv,
  plexPath: string,
  width: number,
  height: number,
): string {
  const url = new URL(env.baseUrl + '/photo/:/transcode')
  url.searchParams.set('url', plexPath)
  url.searchParams.set('width', String(width))
  url.searchParams.set('height', String(height))
  url.searchParams.set('minSize', '1')
  url.searchParams.set('upscale', '1')
  return url.toString()
}

/**
 * 딥링크 — 브라우저에서 Plex 로 넘긴다.
 * app.plex.tv 가 아니라 서버가 직접 서빙하는 웹앱을 쓴다(이유는 lib/library.ts 의 같은 함수).
 */
export function buildPlexDeepLink(baseUrl: string, serverId: string, ratingKey: string): string {
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`)
  return `${baseUrl.replace(/\/+$/, '')}/web/index.html#!/server/${serverId}/details?key=${key}`
}
