# 웹 ↔ 앱 셸 브릿지 계약

> 이 문서는 **`nuplex`(웹)와 `nuplex-app`(모바일 셸) 사이의 계약**이다.
> 두 저장소 모두에 같은 내용을 둔다. 한쪽만 고치면 계약이 깨진다.
>
> - 원본: `nuplex-app/docs/BRIDGE_CONTRACT.md`
> - 사본: `nuplex/docs/BRIDGE_CONTRACT.md`
>
> 계약 버전: **2**

## 왜 계약이 필요한가

두 저장소는 런타임에 결합된다. 그런데 배포 주기가 다르다.

- 웹은 앱 업데이트 없이 바뀐다. 셸은 **어떤 버전의 웹이 로드될지 모른다.**
- 앱은 사용자가 업데이트해야 바뀐다. 웹은 **구버전 셸을 쓰는 사용자가 남아 있다는 것을 전제해야 한다.**

그래서 규칙은 두 줄로 요약된다.

1. **셸은 브릿지 메서드를 절대 제거하지 않는다.** 새 기능은 `bridgeVersion` 을 올리고 메서드를 추가하는 것으로만 한다.
2. **웹은 브릿지를 항상 optional 로 취급한다.** 브라우저에서도 똑같이 동작해야 한다.

## 1. 셸이 웹에 주입하는 객체

웹뷰 로드 시 `window.NuplexNative` 가 주입된다. 브라우저에는 없다.

주입은 **네이티브가 문서 시작 시점에** 한다(ADR-004). 따라서 웹의 첫 스크립트가
돌기 전에 이미 존재한다. 그래도 순서를 확신할 수 없다면 `nuplexnativeready`
이벤트를 함께 들으면 된다.

```ts
window.addEventListener('nuplexnativeready', () => { /* 브릿지 준비됨 */ })
```

```ts
interface NuplexNative {
  /** 이 계약의 버전. 웹은 이 값으로 기능 지원 여부를 판단한다. */
  bridgeVersion: number            // 현재 2
  /** 셸 앱 버전 (semver) */
  appVersion: string               // 예: "1.0.0"
  platform: 'ios' | 'android'

  /**
   * Plex 앱 · 스토어 · 브라우저 중 한 곳으로 보낸다. 판단과 폴백은 전부 셸이 한다.
   *
   * **`machineIdentifier` 와 `ratingKey` 를 반드시 함께 넘길 것.** 웹이 만드는
   * `webUrl` 은 우리 서버가 서빙하는 Plex 웹앱 주소라서 Plex 앱이 가로채지 않는다.
   * 셸은 이 둘로 앱용 주소를 다시 만들고, `webUrl` 은 최후의 폴백으로만 쓴다.
   *
   * **`type` 도 함께 넘길 것.** Plex 앱의 항목 딥링크는 재생 명령이라, 재생할 파일이
   * 없는 묶음(`show` · `season` · `collection`)을 주면 오류 팝업이 뜬다. 종류를 알면
   * 셸이 그런 항목을 웹 폴백으로 보내 상세 화면을 띄운다. 없으면 재생 가능한 항목으로
   * 보고 진행한다 — 구버전 웹과의 호환. 자세한 근거는 PLEX_DEEPLINK.md.
   */
  openInPlex(params: {
    webUrl: string                 // 웹이 만든 주소 (필수, 폴백용)
    machineIdentifier?: string     // 없으면 앱 딥링크를 포기한다
    ratingKey?: string             // 없으면 앱 딥링크를 포기한다
    type?: string                  // 'movie' | 'episode' | 'show' | 'season' | 'collection' …
  }): Promise<{ opened: 'app' | 'browser' | 'store' }>

  /** 알림 권한 상태 조회 및 요청 */
  getPushPermission(): Promise<'granted' | 'denied' | 'prompt'>
  requestPushPermission(): Promise<'granted' | 'denied'>

  /** 현재 FCM 토큰. 없으면 null */
  getPushToken(): Promise<string | null>

  /** 로그아웃 시 호출 — 서버 등록 해제 + 로컬 캐시 삭제 */
  clearPushRegistration(): Promise<void>

  /**
   * **[v2]** 후보 중 지금 닿는 플레이어만 골라 돌려준다.
   *
   * 후보 목록은 **웹이 만들어 넘긴다** — 셸은 plex.tv 를 부르지 않는다. 계정 토큰을
   * 셸에 두지 않기 위함이다. 셸이 하는 일은 각 후보에 실제로 붙어 보고 살아 있는
   * 것만 남기는 것이다.
   *
   * **같은 WiFi 에 있을 때만 결과가 나온다.** Plex 플레이어는 사설 IP 하나만 광고하고
   * relay 주소가 없어서 밖에서는 원리적으로 닿지 않는다. 빈 배열이면 "TV에서 시청"
   * 항목을 감추면 된다 — 별도 분기가 필요 없다.
   */
  listCastTargets(params: {
    candidates: { id: string; name: string; uri: string }[]
    token: string
  }): Promise<{ targets: { id: string; name: string; uri: string }[] }>

  /**
   * **[v2]** 플레이어에 재생을 시킨다.
   *
   * `targetId` 는 **listCastTargets 가 돌려준 값**을 그대로 쓸 것. 후보로 넣은 id 와
   * 다를 수 있다 — 플레이어가 스스로 보고하는 값이 진짜다.
   *
   * 실패 이유 중 `rejected` 는 대개 **TV 에서 Plex 앱이 꺼져 있는 것**이다.
   * Companion 서버가 그 앱 프로세스 안에 있어 앱이 떠 있어야만 명령을 받는다.
   * 웹은 이 경우 "TV 에서 Plex 를 먼저 켜세요" 를 안내한다.
   */
  castToTarget(params: {
    targetId: string
    uri: string
    token: string
    serverAddress: string
    serverPort: number
    serverProtocol: 'http' | 'https'
    machineIdentifier: string
    ratingKey: string
    offset?: number
  }): Promise<{ ok: boolean; error?: string; status?: number; detail?: string }>

  /**
   * **[v2]** 시스템 화면 공유 피커를 연다.
   *
   * **플랫폼마다 다른 물건이고 둘 다 한계가 뚜렷하다. "TV로 쏘기" 의 대체재가 아니다.**
   * - iOS: AirPlay 피커. 앱이 네이티브로 재생 중인 것이 없으면 골라도 아무 일이
   *   일어나지 않는다. 화면 미러링은 제어 센터 전용이라 앱이 시작시킬 수 없다.
   * - Android: 시스템 캐스트 설정 패널. 목록은 Google Cast 계열이라
   *   **Apple TV 는 뜨지 않는다.**
   */
  openRoutePicker(): Promise<{ shown: boolean }>

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
<기본 UA> NuplexApp (ios; bridge/2)
<기본 UA> NuplexApp (android; bridge/2)
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

- **인증은 서명 쿠키다.** `nuplex_profile`(1년) · 관리자만 `nuplex_admin`(12시간),
  `httpOnly`, `sameSite=lax`, 운영에서 `secure`. 열람용 공통 비밀번호는 없다 —
  관문은 프로필 하나다. 셸은 토큰을 따로 보관하지 않고 웹뷰 쿠키 저장소를 그대로 쓴다.
- **전 경로가 인증 게이트 뒤에 있다.** 프로필 쿠키가 없으면 입장 화면 `/welcome`
  (거기서 `/profile` 로 이어짐)로 리다이렉트된다. 셸이 푸시 라우트로 진입해도 이
  리다이렉트를 거칠 수 있으므로, 입장 후 원래 목적지로 돌아가는 `?next=` 처리에
  의존한다.
- **인증 없이 열리는 경로**는 `/welcome` · `/guide` · `/profile` 과 `/api/profile` ·
  `/api/auth/logout` · `/api/app/config` · `/media/avatars` 다(`nuplex/proxy.ts`).
- **작품 상세 경로는 `/title/<ratingKey>`** 이다.
- **Plex 링크는 웹이 만들지만 앱은 그대로 쓰지 않는다** (`lib/library.ts`):
  `https://plex.nugabox.com/web/index.html#!/server/<machineIdentifier>/details?key=<urlencoded /library/metadata/ratingKey>`
  우리 서버 도메인이라 Plex 앱이 가로채지 않는다. 셸이 식별자로 앱용 주소를 다시
  만든다 — [PLEX_DEEPLINK.md](PLEX_DEEPLINK.md).

## 7. TV 캐스트 (v2) — 웹이 알아야 할 것

자세한 근거는 [PLEX_CAST.md](PLEX_CAST.md). 웹 구현에 직접 걸리는 것만 적는다.

1. **후보 목록은 웹이 만든다.** `plex.tv/api/resources` 를 서버에서 호출해
   `provides` 에 `player` 가 있는 기기를 고른다. 토큰은 서버에 둔다.
2. **후보의 연결 주소는 사설 IP 다.** 그대로 셸에 넘기면 셸이 도달 확인을 한다.
3. **목록이 비면 "TV에서 시청" 을 감춘다.** 밖에 있을 때가 대부분이라 정상 상황이다.
4. **`plex.tv` 기기 목록은 Plex 계정 단위다.** NUPLEX 프로필과는 무관하다.
   프로필마다 다른 TV 를 대상으로 하려면 프로필 ↔ Plex 계정 연결이 먼저 필요하다.
5. **브라우저에서는 전부 없는 것으로 동작해야 한다.** `bridgeVersion >= 2` 를 확인할 것.
