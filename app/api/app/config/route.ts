import { NextResponse } from 'next/server'
import { isPushConfigured } from '@/lib/push/fcm'

// 모바일 앱 셸(nuplex-app)이 부팅할 때마다 읽는 설정.
//
// 앱 업데이트 없이 셸 동작을 바꿀 수 있는 유일한 통로다. 어느 도메인을 웹뷰에
// 띄울지, 이 버전을 계속 써도 되는지가 여기서 정해진다.
//
// 인증을 걸지 않는다. 셸은 로그인 화면에 닿기도 전에 이걸 호출한다
// (proxy.ts 의 PUBLIC_PATHS 참고).
//
// 계약: docs/BRIDGE_CONTRACT.md §3 · docs/APP-INTEGRATION.md §1

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const body = {
    // 셸이 웹뷰로 로드할 주소. 도메인을 옮기면 여기만 바꾸면 된다.
    webBaseUrl: process.env.SITE_URL || 'https://nuplex.nugabox.com',
    // 이 값 미만의 앱은 강제 업데이트 화면에서 멈춘다. 스토어에 새 버전이 실제로
    // 올라간 뒤에만 올릴 것.
    // 이름이 두 갈래로 쓰인 적이 있어 둘 다 받는다. .env.example 은 긴 쪽을 쓴다.
    minSupportedAppVersion:
      process.env.APP_MIN_SUPPORTED_VERSION || process.env.APP_MIN_VERSION || '1.0.0',
    recommendedAppVersion: process.env.APP_RECOMMENDED_VERSION || '1.0.0',
    maintenance: {
      // '1' 과 'true' 를 모두 켜짐으로 본다. 점검 플래그를 켰는데 표기법이 달라
      // 안 걸리는 것이 가장 나쁜 실패다.
      enabled: process.env.APP_MAINTENANCE === '1' || process.env.APP_MAINTENANCE === 'true',
      message: process.env.APP_MAINTENANCE_MESSAGE || '',
    },
    features: {
      // 서버에 FCM 자격증명이 없으면 셸이 권한 요청조차 하지 않게 한다.
      // 받을 수도 없는 알림을 허용해 달라고 묻는 것만큼 나쁜 첫인상이 없다.
      // 플래그로 끌 수도 있고, 자격증명이 없으면 플래그와 무관하게 꺼진다.
      pushEnabled: process.env.APP_PUSH_ENABLED !== '0' && isPushConfigured(),
      // plex:// 커스텀 스킴 실험 플래그. 기본은 꺼둔다 — Plex 가 공식 문서화한
      // 스킴이 아니라서 OS 업데이트에 깨질 수 있다(설계문서 ADR-003).
      plexCustomScheme: process.env.APP_PLEX_CUSTOM_SCHEME === '1',
    },
    // 심사 전에는 비어 있어도 된다. 셸은 빈 문자열이면 스토어 버튼을 감춘다.
    storeUrls: {
      ios: process.env.APP_STORE_URL_IOS || '',
      android: process.env.APP_STORE_URL_ANDROID || '',
    },
  }

  // 셸은 이 응답을 자기 저장소에 캐시한다. 중간(웹뷰·프록시)에서 또 캐시하면
  // 설정을 바꿔도 한동안 반영되지 않는다.
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
