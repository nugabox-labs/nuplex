# 웹 ↔ 앱 셸 브릿지 계약

> 이 문서는 **`nuplex`(웹)와 `nuplex-app`(모바일 셸) 사이의 계약**이다.
> 두 저장소 모두에 같은 내용을 둔다. 한쪽만 고치면 계약이 깨진다.
>
> - 원본: `nuplex-app/docs/BRIDGE_CONTRACT.md`
> - 사본: `nuplex/docs/BRIDGE_CONTRACT.md`
>
> 계약 버전: **1**

## 왜 계약이 필요한가

두 저장소는 런타임에 결합된다. 그런데 배포 주기가 다르다.

- 웹은 앱 업데이트 없이 바뀐다. 셸은 **어떤 버전의 웹이 로드될지 모른다.**
- 앱은 사용자가 업데이트해야 바뀐다. 웹은 **구버전 셸을 쓰는 사용자가 남아 있다는 것을 전제해야 한다.**

그래서 규칙은 두 줄로 요약된다.

1. **셸은 브릿지 메서드를 절대 제거하지 않는다.** 새 기능은 `bridgeVersion` 을 올리고 메서드를 추가하는 것으로만 한다.
2. **웹은 브릿지를 항상 optional 로 취급한다.** 브라우저에서도 똑같이 동작해야 한다.

## 1. 셸이 웹에 주입하는 객체

웹뷰 로드 시 `window.NuplexNative` 가 주입된다. 브라우저에는 없다.

```ts
interface NuplexNative {
  /** 이 계약의 버전. 웹은 이 값으로 기능 지원 여부를 판단한다. */
  bridgeVersion: number            // 현재 1
  /** 셸 앱 버전 (semver) */
  appVersion: string               // 예: "1.0.0"
  platform: 'ios' | 'android'

  /** Plex 앱 또는 웹으로 이동. 스킴 판단과 폴백은 셸이 처리한다. */
  openInPlex(params: {
    webUrl: string                 // https://app.plex.tv/... (필수)
    machineIdentifier?: string
    ratingKey?: string
  }): Promise<{ opened: 'app' | 'browser' }>

  /** 알림 권한 상태 조회 및 요청 */
  getPushPermission(): Promise<'granted' | 'denied' | 'prompt'>
  requestPushPermission(): Promise<'granted' | 'denied'>

  /** 현재 FCM 토큰. 없으면 null */
  getPushToken(): Promise<string | null>

  /** 로그아웃 시 호출 — 서버 등록 해제 + 로컬 캐시 삭제 */
  clearPushRegistration(): Promise<void>

  /** 외부 링크를 시스템 브라우저로 연다 */
  openExternal(url: string): Promise<void>

  /** 앱 배지 숫자 (미확인 알림 수) */
  setBadgeCount(n: number): Promise<void>

  /** 웹이 라우팅 준비를 마쳤음을 알린다. §4 참고 — 반드시 호출해야 한다. */
  notifyWebReady(): void
}
```

### 웹 측 사용 규약

```ts
const native = (window as { NuplexNative?: NuplexNative }).NuplexNative

if (native && native.bridgeVersion >= 1) {
  await native.openInPlex({ webUrl })
} else {
  window.open(webUrl, '_blank')   // 브라우저 폴백
}
```

버전 체크 없이 메서드를 부르면 구버전 셸에서 `TypeError` 로 화면이 죽는다.
**존재 확인과 버전 확인을 모두 할 것.**

## 2. User-Agent 식별

서버사이드에서도 앱 여부를 알 수 있도록 UA 에 접미사가 붙는다.

```
<기본 UA> NuplexApp (ios; bridge/1)
<기본 UA> NuplexApp (android; bridge/1)
```

Capacitor 8 에서 공백 처리 동작이 바뀐 이력이 있다.
**공백 개수에 의존하지 말고 정규식으로 파싱할 것.**

```ts
const m = ua.match(/NuplexApp \((ios|android); bridge\/(\d+)\)/)
```

## 3. 원격 설정 — `GET /api/app/config`

셸이 부팅할 때마다 호출한다. **앱 업데이트 없이 셸 동작을 제어하는 유일한 수단이다.**

담당: `nuplex`(웹). 인증 불필요 — 셸은 로그인 전에 이걸 호출한다.

```jsonc
{
  "webBaseUrl": "https://nuplex.nugabox.com",
  "minSupportedAppVersion": "1.0.0",   // 미만이면 강제 업데이트 화면
  "recommendedAppVersion": "1.0.0",    // 미만이면 부드러운 안내
  "maintenance": { "enabled": false, "message": "" },
  "features": {
    "pushEnabled": true,
    "plexCustomScheme": false          // 실험 플래그
  },
  "storeUrls": { "ios": "", "android": "" }
}
```

**폴백 정책**: 이 API 가 실패하면 셸은 마지막 성공 응답 캐시를 쓰고, 캐시도 없으면
하드코딩 기본값으로 부팅한다. **설정 API 장애가 앱 부팅 불가로 이어져서는 안 된다.**
따라서 웹은 이 응답을 `Cache-Control: no-store` 로 내려야 하고, 실패해도 500 대신
가능하면 기본값을 200 으로 주는 편이 낫다.

## 4. 푸시 라우팅과 `notifyWebReady`

푸시 페이로드의 `route` 는 **웹의 경로 문자열**이지 완전한 URL 이 아니다
(예: `/title/12345`). 셸이 `webBaseUrl + route` 로 조립한다. 도메인이 바뀌어도
과거에 발송된 알림이 깨지지 않게 하기 위함이다.

앱이 완전히 종료된 상태에서 알림을 탭하면 **라우팅 이벤트가 웹뷰 로드보다 먼저 도착한다.**
셸은 이 경로를 큐에 넣고, 웹이 `notifyWebReady()` 를 부른 뒤에 flush 한다.

```ts
// 웹: 라우터 초기화가 끝난 직후 한 번 호출
;(window as any).NuplexNative?.notifyWebReady?.()
```

**이 호출을 빠뜨리면 "앱 종료 상태에서 알림 탭" 이 홈으로만 가고 해당 작품으로
이동하지 않는다.** 실무에서 가장 자주 깨지는 지점이다.

페이로드 스키마는 [PUSH_PAYLOAD.md](PUSH_PAYLOAD.md) 를 따른다.

## 5. 계약 변경 절차

- 이 문서를 바꿀 때는 **양 저장소의 PR 을 함께 연다.**
- 하위 호환을 최소 1개 메이저 버전 이상 유지한다.
- 구버전 셸 지원을 끊어야 할 때만 `minSupportedAppVersion` 을 올려 강제 업데이트를 유도한다.
- **웹 배포 전 앱 셸에서 주요 플로우를 확인한다.** 웹 배포만으로 앱이 깨질 수 있다.

## 6. 알아둘 웹 쪽 사정

셸을 만들 때 전제하는 `nuplex` 웹의 현재 동작이다.

- **인증은 서명 쿠키다.** `nuplex_session`(30일) · `nuplex_profile`(1년), `httpOnly`,
  `sameSite=lax`, 운영에서 `secure`. 셸은 토큰을 따로 보관하지 않고 웹뷰 쿠키
  저장소를 그대로 쓴다.
- **전 경로가 인증 게이트 뒤에 있다.** 미인증이면 `/login`, 프로필 미선택이면
  `/profile` 로 리다이렉트된다. 셸이 푸시 라우트로 진입해도 이 리다이렉트를 거칠 수
  있으므로, 로그인 후 원래 목적지로 돌아가는 `?next=` 처리에 의존한다.
- **작품 상세 경로는 `/title/<ratingKey>`** 이다.
- **Plex 딥링크 포맷은 웹이 이미 만들고 있다** (`lib/plex/client.ts`):
  `https://app.plex.tv/desktop/#!/server/<machineIdentifier>/details?key=<urlencoded /library/metadata/ratingKey>`
