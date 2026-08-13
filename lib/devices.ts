import 'server-only'
import { db, query, queryOne } from '@/lib/db'
import { isPushConfigured, sendToToken } from '@/lib/push/fcm'

// 앱 기기 등록과 푸시 발송.
//
// 알림 한 건이 웹의 종 아이콘과 앱의 푸시 양쪽으로 나간다 — 같은 notice 행을 쓴다.
// 대상은 프로필 단위이고, notice_target 이 비어 있으면 전체 발송이다.

export interface RegisterDeviceInput {
  deviceId: string
  token: string
  platform: 'ios' | 'android'
  appVersion?: string | null
  locale?: string | null
  timezone?: string | null
  profileId?: number | null
}

export async function registerDevice(input: RegisterDeviceInput): Promise<void> {
  await db.query(
    `INSERT INTO device (
       device_id, push_token, platform, app_version, locale, timezone, profile_id,
       last_seen_at, revoked_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), NULL)
     ON CONFLICT (device_id) DO UPDATE SET
       push_token = EXCLUDED.push_token,
       platform = EXCLUDED.platform,
       app_version = EXCLUDED.app_version,
       locale = EXCLUDED.locale,
       timezone = EXCLUDED.timezone,
       -- 프로필을 안 보냈으면(앱이 아직 모름) 이전 값을 유지한다
       profile_id = COALESCE(EXCLUDED.profile_id, device.profile_id),
       last_seen_at = now(),
       -- 다시 등록했다는 건 살아 있다는 뜻이다
       revoked_at = NULL`,
    [
      input.deviceId,
      input.token,
      input.platform,
      input.appVersion ?? null,
      input.locale ?? null,
      input.timezone ?? null,
      input.profileId ?? null,
    ],
  )
}

/** 로그아웃 · 알림 끄기. 행을 지우지 않고 무효 표시만 한다(재설치 이력 추적용). */
export async function revokeDevice(deviceId: string): Promise<void> {
  await db.query(
    `UPDATE device SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL`,
    [deviceId],
  )
}

/** 이 기기가 보고 있는 프로필을 갱신한다. 앱에서 프로필을 바꿨을 때 부른다. */
export async function setDeviceProfile(deviceId: string, profileId: number | null): Promise<void> {
  await db.query(
    `UPDATE device SET profile_id = $2, last_seen_at = now() WHERE device_id = $1`,
    [deviceId, profileId],
  )
}

interface DeviceRow {
  id: string
  push_token: string
}

/**
 * 알림 하나를 받을 기기 목록.
 * 대상 프로필이 지정돼 있으면 그 프로필을 고른 기기만, 없으면 전부.
 */
async function targetDevices(noticeId: string): Promise<DeviceRow[]> {
  return query<DeviceRow>(
    `SELECT d.id, d.push_token
       FROM device d
      WHERE d.revoked_at IS NULL
        AND (
          NOT EXISTS (SELECT 1 FROM notice_target t WHERE t.notice_id = $1)
          OR d.profile_id IN (SELECT profile_id FROM notice_target WHERE notice_id = $1)
        )`,
    [noticeId],
  )
}

export interface DeliveryResult {
  queued: number
  sent: number
  failed: number
  revoked: number
  configured: boolean
}

/**
 * 알림을 대상 기기로 보낸다.
 *
 * 자격증명이 없으면 발송 대기(pending)만 쌓아둔다. 나중에 키를 넣고 다시 부르면
 * 그대로 나간다 — 알림을 다시 만들 필요가 없다.
 */
export async function deliverNotice(noticeId: string): Promise<DeliveryResult> {
  const devices = await targetDevices(noticeId)
  const result: DeliveryResult = {
    queued: devices.length,
    sent: 0,
    failed: 0,
    revoked: 0,
    configured: isPushConfigured(),
  }

  // 먼저 대기 레코드를 만든다. 여기서 죽어도 무엇을 보내려 했는지가 남는다.
  for (const device of devices) {
    await db.query(
      `INSERT INTO notice_delivery (notice_id, device_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (notice_id, device_id) DO NOTHING`,
      [noticeId, device.id],
    )
  }

  if (!result.configured || devices.length === 0) return result

  const notice = await queryOne<{ title: string; body: string }>(
    `SELECT title, body FROM notice WHERE id = $1`,
    [noticeId],
  )
  if (!notice) return result

  for (const device of devices) {
    const outcome = await sendToToken(device.push_token, {
      title: notice.title,
      // 푸시 본문은 길면 잘린다. 앱에서 전문을 보게 하고 여기선 앞부분만 싣는다.
      body: notice.body.slice(0, 200),
      route: '/?notice=' + noticeId,
      type: 'notice',
      collapseKey: 'notice',
    })

    if (outcome.ok) {
      result.sent += 1
      await db.query(
        `UPDATE notice_delivery SET status = 'sent', sent_at = now(), error = NULL
          WHERE notice_id = $1 AND device_id = $2`,
        [noticeId, device.id],
      )
      continue
    }

    result.failed += 1
    await db.query(
      `UPDATE notice_delivery SET status = 'failed', error = $3
        WHERE notice_id = $1 AND device_id = $2`,
      [noticeId, device.id, outcome.error],
    )

    // 앱을 지운 기기다. 남겨두면 발송할 때마다 실패를 반복하고 할당량만 먹는다.
    if (outcome.unregistered) {
      result.revoked += 1
      await db.query(`UPDATE device SET revoked_at = now() WHERE id = $1`, [device.id])
    }
  }

  return result
}

/**
 * 새 채팅 메시지를 받는 사람의 기기로 보낸다.
 *
 * 발송 이력을 남기지 않는 것이 알림(notice)과 다르다 — 채팅은 메시지 자체가 DB 에
 * 남아 있고, 못 받은 푸시는 앱을 열면 목록에서 그대로 보인다. 기기 × 메시지만큼
 * 행을 쌓을 이유가 없다.
 *
 * collapseKey 를 대화 단위로 묶어서, 안 읽은 사이에 여러 통이 와도 알림줄에는
 * 마지막 하나만 남게 한다.
 */
export async function sendChatPush(
  recipientProfileId: number,
  message: { title: string; body: string; conversationId: string },
): Promise<void> {
  if (!isPushConfigured()) return

  const devices = await query<DeviceRow>(
    `SELECT id, push_token FROM device
      WHERE revoked_at IS NULL AND profile_id = $1`,
    [recipientProfileId],
  )

  for (const device of devices) {
    const outcome = await sendToToken(device.push_token, {
      title: message.title,
      body: message.body.slice(0, 200),
      route: `/?chat=${message.conversationId}`,
      type: 'chat',
      collapseKey: `chat-${message.conversationId}`,
    })
    if (!outcome.ok && outcome.unregistered) {
      await db.query(`UPDATE device SET revoked_at = now() WHERE id = $1`, [device.id])
    }
  }
}

/** 아직 못 보낸 알림을 다시 시도한다. 자격증명을 나중에 넣었을 때 쓴다. */
export async function retryPending(): Promise<DeliveryResult[]> {
  const pending = await query<{ notice_id: string }>(
    `SELECT DISTINCT notice_id FROM notice_delivery WHERE status = 'pending'`,
  )
  const results: DeliveryResult[] = []
  for (const row of pending) results.push(await deliverNotice(row.notice_id))
  return results
}
