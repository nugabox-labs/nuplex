import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { registerDevice, revokeDevice } from '@/lib/devices'

// 앱 셸의 푸시 토큰 등록/해제(설계문서 §6.4).
// 프로필 관문 뒤에 있다 — proxy 가 이미 막고 있으므로 입장한 앱만 도달한다.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const platform = body?.platform === 'ios' || body?.platform === 'android' ? body.platform : null

  if (!deviceId || !token || !platform) {
    return NextResponse.json(
      { error: 'deviceId · token · platform 이 필요합니다.' },
      { status: 400 },
    )
  }

  // 기기가 어느 프로필을 보고 있는지는 쿠키가 이미 알고 있다. 앱이 따로 안 보내도 된다.
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)

  await registerDevice({
    deviceId,
    token,
    platform,
    appVersion: typeof body?.appVersion === 'string' ? body.appVersion : null,
    locale: typeof body?.locale === 'string' ? body.locale : null,
    timezone: typeof body?.timezone === 'string' ? body.timezone : null,
    profileId,
  })

  return NextResponse.json({ ok: true, profileId })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId 가 필요합니다.' }, { status: 400 })
  }
  await revokeDevice(deviceId)
  return NextResponse.json({ ok: true })
}
