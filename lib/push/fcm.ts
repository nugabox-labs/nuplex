import 'server-only'
import { createSign } from 'node:crypto'

// FCM HTTP v1 로 푸시를 보낸다.
//
// 자격증명(FCM_SERVICE_ACCOUNT)이 없으면 이 모듈은 "설정 안 됨"만 알려주고 아무것도
// 하지 않는다. 발송 대기 레코드는 그대로 쌓이므로, 나중에 키를 넣으면 그때부터 나간다.
//
// 라이브러리를 쓰지 않고 직접 서명한다 — 필요한 건 JWT 하나와 POST 하나뿐인데
// firebase-admin 전체(수십 MB)를 이미지에 넣을 이유가 없다.

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw?.trim()) return null
  try {
    // 한 줄 JSON 그대로 넣기도 하고, base64 로 넣기도 한다. 둘 다 받는다.
    const text = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8')
    const parsed = JSON.parse(text) as ServiceAccount
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null
    // .env 한 줄에 넣으면 개행이 \n 문자열로 들어온다.
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
    return parsed
  } catch {
    return null
  }
}

export function isPushConfigured(): boolean {
  return readServiceAccount() !== null
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// 액세스 토큰은 1시간짜리라 매번 새로 받지 않는다.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const signature = base64Url(signer.sign(account.private_key))

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    throw new Error(`FCM 토큰 발급 실패 (${res.status} ${await res.text()})`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return json.access_token
}

export interface PushMessage {
  title: string
  body: string
  /** 셸이 웹뷰에서 열 경로. 완전한 URL 이 아니라 경로다(설계문서 §6.1) */
  route: string
  type?: string
  collapseKey?: string
}

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; unregistered: boolean }

/**
 * Android 알림 채널을 골라 준다. 앱의 채널 표(nuplex-app/docs/PUSH_PAYLOAD.md)와 맞춘다.
 *
 * 채널을 지정하지 않으면 앱이 백그라운드일 때 시스템이 매니페스트 기본 채널(general)로
 * 알림을 그린다. 그러면 사용자가 "채팅 알림만 끄기" 를 해도 백그라운드에서는 계속 온다 —
 * 포그라운드와 백그라운드가 다른 채널을 쓰는 셈이라 설정이 거짓말이 된다.
 */
const ANDROID_CHANNELS = new Set(['chat', 'new_item', 'available'])

function androidChannel(type: string): string {
  return ANDROID_CHANNELS.has(type) ? type : 'general'
}

/**
 * 다시 시도해도 소용없는 토큰인가.
 *
 *   404 UNREGISTERED   앱을 지웠거나 토큰이 만료됨
 *   400 INVALID_ARGUMENT + "registration token"
 *                      토큰 자체가 망가짐. 영원히 실패한다
 *
 * 400 을 무조건 죽은 토큰으로 보면 안 된다 — 우리가 페이로드를 잘못 만들었을 때도
 * 400 이 온다. 그 경우까지 기기를 무효 처리하면 멀쩡한 기기를 통째로 날린다.
 * 그래서 메시지에 토큰 얘기가 있을 때만 죽은 것으로 판정한다.
 */
function isDeadToken(status: number, body: string): boolean {
  if (status === 404 || body.includes('UNREGISTERED') || body.includes('NOT_FOUND')) return true
  return status === 400 && /registration token/i.test(body)
}

/**
 * 한 기기에 보낸다.
 *
 * 라우팅에 필요한 값은 전부 `data` 에 담는다. iOS 백그라운드에서는 `notification` 만
 * 오면 JS 리스너가 안 불리기 때문이다(설계문서 §6.1 · §6.2).
 */
export async function sendToToken(token: string, message: PushMessage): Promise<SendResult> {
  const account = readServiceAccount()
  if (!account) return { ok: false, error: 'FCM_SERVICE_ACCOUNT 가 설정되지 않았습니다.', unregistered: false }

  try {
    const accessToken = await getAccessToken(account)
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: {
              v: '1',
              type: message.type ?? 'notice',
              route: message.route,
              ...(message.collapseKey ? { collapseKey: message.collapseKey } : {}),
            },
            android: {
              priority: 'HIGH',
              notification: { channel_id: androidChannel(message.type ?? 'notice') },
              ...(message.collapseKey ? { collapse_key: message.collapseKey } : {}),
            },
            apns: {
              payload: { aps: { sound: 'default' } },
              ...(message.collapseKey ? { headers: { 'apns-collapse-id': message.collapseKey } } : {}),
            },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    )

    if (res.ok) return { ok: true }

    const text = await res.text()
    return { ok: false, error: `${res.status} ${text.slice(0, 300)}`, unregistered: isDeadToken(res.status, text) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      unregistered: false,
    }
  }
}
