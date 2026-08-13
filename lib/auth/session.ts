// 쿠키 두 개. 값은 "범위 + 만료시각" 뿐이고, 위조를 막기 위해 HMAC 서명을 붙인다.
//   · 프로필 — 지금 보는 사람이 누구인가. 이게 곧 입장 관문이다.
//   · 관리자 — 관리자 비밀번호를 통과했는가.
//
// 범위가 서명 대상에 포함되므로 프로필 쿠키를 관리자 쿠키 자리에 넣을 수 없다.
//
// Web Crypto 만 쓴다. proxy(Edge 런타임)와 라우트 핸들러(Node) 양쪽에서
// 같은 코드가 돌아야 하기 때문이다.

export const ADMIN_COOKIE = 'nuplex_admin'

// 관리자 세션은 짧게 둔다. 알림을 올릴 때만 쓰는 권한이다.
export const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 12 // 12시간

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET 이 설정되지 않았습니다.')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey()
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toBase64Url(signature)
}

/** 만료시각을 담은 서명된 관리자 쿠키 값을 만든다. */
export async function createAdminValue(): Promise<string> {
  const payload = `admin:${Date.now() + ADMIN_MAX_AGE_SECONDS * 1000}`
  return `${payload}.${await sign(payload)}`
}

// --- 프로필 쿠키 -------------------------------------------------------------
// "지금 보는 사람이 누구인가". 1년을 간다 — "나가기" 를 누르기 전까지는 다시 묻지 않는다.
// 웹뷰 앱에서도 같은 쿠키가 유지되므로 앱 저장소를 따로 쓰지 않는다.

export const PROFILE_COOKIE = 'nuplex_profile'
export const PROFILE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1년

export async function createProfileValue(profileId: number): Promise<string> {
  const payload = `profile:${profileId}:${Date.now() + PROFILE_MAX_AGE_SECONDS * 1000}`
  return `${payload}.${await sign(payload)}`
}

/** 서명과 만료가 맞으면 프로필 id 를, 아니면 null 을 돌려준다. */
export async function readProfileValue(value: string | undefined): Promise<number | null> {
  if (!value) return null
  const separator = value.lastIndexOf('.')
  if (separator < 1) return null

  const payload = value.slice(0, separator)
  if (!(await matchesSignature(payload, value.slice(separator + 1)))) return null

  const [scope, id, expiresAt] = payload.split(':')
  if (scope !== 'profile') return null
  if (!(Number(expiresAt) > Date.now())) return null

  const profileId = Number(id)
  return Number.isInteger(profileId) && profileId > 0 ? profileId : null
}

/** 서명을 상수 시간으로 비교한다. */
async function matchesSignature(payload: string, signature: string): Promise<boolean> {
  const expected = await sign(payload)
  // 길이가 다르면 비교할 것도 없다.
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

/** 서명 · 범위 · 만료를 함께 검사한다. 하나라도 어긋나면 false. */
export async function verifyAdminValue(value: string | undefined): Promise<boolean> {
  if (!value) return false
  const separator = value.lastIndexOf('.')
  if (separator < 1) return false

  const payload = value.slice(0, separator)
  if (!(await matchesSignature(payload, value.slice(separator + 1)))) return false

  const [payloadScope, expiresAt] = payload.split(':')
  if (payloadScope !== 'admin') return false
  return Number.isFinite(Number(expiresAt)) && Number(expiresAt) > Date.now()
}
