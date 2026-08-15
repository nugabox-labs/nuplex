# 앱 연동 (nuplex-app)

`nugabox-labs/nuplex-app` 은 이 웹서비스를 웹뷰로 감싸는 iOS · Android 셸이다.
두 저장소는 **런타임에 결합**되므로 계약을 여기 적어둔다. 셸 쪽 설계 명세가 원본이고,
이 문서는 **웹이 져야 할 책임**만 추린 것이다.

## 0. 작업 분담 — 건드리기 전에 확인할 것

앱 연동은 두 갈래로 동시에 진행됐다. **다른 갈래의 파일은 수정하지 않는다.**
새로 맡는 영역이 생기면 이 표에 먼저 줄을 추가하고 시작한다.

| 영역 | 파일 | 갈래 |
| --- | --- | --- |
| 푸시 DB · 발송 · 토큰 등록 | `database/0004_push.sql`, `lib/push/`, `lib/devices.ts`, `app/api/app/push/` | 푸시 백엔드 |
| 공지 → 푸시 연결 | `lib/notices.ts`, `app/api/admin/notices/`, `components/notice-admin.tsx` | 푸시 백엔드 |
| 프로필 | `lib/profiles.ts`, `components/profile-picker.tsx` | 프로필 |
| 채팅 · 채팅 푸시 | `database/0006_chat.sql`, `lib/chat.ts`, `app/api/chat/`, `components/chat-panel.tsx` | 채팅 ([CHAT.md](CHAT.md)) |
| 원격 설정 API | `app/api/app/config/route.ts` | 앱 셸 |
| 셸 대응 (뷰포트 · 캐시) | `app/layout.tsx`, `next.config.mjs` | 앱 셸 |

`proxy.ts` 와 `.env.example` 은 양쪽이 다 건드린다. **줄 단위로 최소한만 고칠 것.**
앱 셸이 넣은 것: `PUBLIC_PATHS` 에 `/api/app/config` (셸은 입장 전에 호출한다).

## 1. 웹이 제공하는 엔드포인트

| 경로 | 용도 | 인증 |
|---|---|---|
| `GET /api/app/config` | 셸 부팅 시 원격 설정 | 없음 |
| `POST /api/app/push/token` | 푸시 토큰 등록 · 갱신 | 프로필 |
| `DELETE /api/app/push/token` | 로그아웃 · 알림 끄기 | 프로필 |

`/api/app/config` 에 인증을 걸지 않은 이유: 셸이 **입장 전에** 부르고, 담긴 값도
공개해도 되는 것뿐이다. 여기가 죽으면 앱이 못 뜨므로 DB 를 읽지 않고 환경변수만 본다.

설정값은 `.env` 로 바꾼다 — 앱 배포 없이 조정할 수 있어야 하기 때문이다.

```
APP_MIN_SUPPORTED_VERSION  이 버전 미만이면 셸이 강제 업데이트 화면을 띄운다
APP_RECOMMENDED_VERSION    미만이면 부드러운 안내
APP_MAINTENANCE            1 이면 점검 화면
APP_MAINTENANCE_MESSAGE
APP_PUSH_ENABLED           0 이면 셸이 알림 권한을 아예 묻지 않는다
APP_PLEX_CUSTOM_SCHEME     plex:// 실험 플래그. 기본 0
APP_STORE_URL_IOS / _ANDROID   심사 전에는 비워둔다. 셸이 스토어 버튼을 감춘다
```

전체 목록과 기본값은 `.env.example` 의 "모바일 앱 셸" 절에 있다.
(`APP_MIN_VERSION` 이라는 짧은 이름도 라우트가 함께 받지만, 새로 쓸 때는 위 이름을 쓴다.)

**`APP_MIN_SUPPORTED_VERSION` 은 스토어에 새 버전이 실제로 올라간 뒤에 올릴 것.**
올리는 순간 그 미만 사용자는 앱이 업데이트 화면에서 멈춘다.

**토큰 등록에 프로필을 따로 안 받는다.** 어느 프로필을 보고 있는지는 이미 쿠키가
알고 있어서 서버가 직접 읽는다. 앱이 프로필을 알 필요가 없다.

## 2. HTML 캐시

`next.config.mjs` 에서 HTML 에 `Cache-Control: no-store` 를 건다.
앱 웹뷰는 브라우저보다 캐시를 오래 붙들어서, 이걸 안 걸면 웹을 배포해도 앱에서는
며칠씩 구버전 화면이 뜬다. 해시가 붙은 `_next/static/*` 과 포스터(`/media/*`)는
예외다 — 그쪽까지 막으면 스크롤할 때마다 이미지를 다시 받는다.

## 3. 푸시

알림 한 건(`notice` 행)이 **웹의 종 아이콘과 앱의 푸시 양쪽**으로 나간다.
대상은 프로필 단위이고, `notice_target` 이 비어 있으면 전체 발송이다.

페이로드는 셸 명세 §6.1 을 따른다. 라우팅에 필요한 값은 전부 `data` 에 담는다 —
iOS 백그라운드에서는 `notification` 만 오면 JS 리스너가 안 불린다.

```jsonc
{
  "notification": { "title": "...", "body": "..." },
  "data": { "v": "1", "type": "notice", "route": "/?notice=12", "collapseKey": "notice" }
}
```

`route` 는 완전한 URL 이 아니라 **경로**다. 셸이 `webBaseUrl + route` 로 조립하므로
도메인이 바뀌어도 과거에 보낸 알림이 깨지지 않는다.

채팅도 같은 형식으로 나간다(`type: "chat"`). 계약은 [CHAT.md §4](CHAT.md#4-푸시-페이로드).
셸은 **모르는 `type` 이 와도 죽지 않아야 한다** — 앞으로 종류가 더 늘어난다.

### 죽은 토큰 정리

셸 명세가 **백엔드 책임으로 명시**한 항목이다. FCM 이 `UNREGISTERED` · `NOT_FOUND` 를
주면 그 기기의 `revoked_at` 을 채운다(`lib/devices.ts`). 안 그러면 앱을 지운 기기의
토큰이 무한히 쌓여 발송이 느려지고 할당량만 먹는다.

### 자격증명이 없을 때

`FCM_SERVICE_ACCOUNT` 가 비어 있으면 발송은 하지 않고 `notice_delivery` 에
`pending` 만 쌓는다. 나중에 키를 넣고 `retryPending()` 을 부르면 그대로 나간다 —
알림을 다시 만들 필요가 없다. 설정 방법은 [FIREBASE-SETUP.md](FIREBASE-SETUP.md).

## 4. 브릿지

셸이 웹뷰에 `window.NuplexNative` 를 주입한다. **웹은 브라우저에서도 돌아야 하므로
항상 없을 수 있다고 보고 쓴다.**

```ts
const native = (window as any).NuplexNative
if (native?.bridgeVersion >= 1) {
  await native.openInPlex({ webUrl, machineIdentifier, ratingKey, type })
} else {
  window.open(webUrl, '_blank')   // 브라우저 폴백
}
```

**`openInPlex` 에는 `webUrl` 만 넘기지 않는다.** 우리가 만드는 주소는 우리 Plex
서버가 서빙하는 웹앱이라 Plex 앱이 가로채지 않는다. 셸이 `machineIdentifier` ·
`ratingKey` 로 앱용 주소를 다시 만들고, `type` 으로 재생 가능한 항목인지 가른다
(시리즈를 재생하라고 보내면 Plex 앱이 오류를 띄운다). 호출부는 `components/plex-link.tsx`.

셸의 브릿지 메서드는 **절대 제거하지 않는다.** 웹은 앱 업데이트 없이 바뀌지만
구버전 셸을 쓰는 사용자는 남아 있다. 새 기능은 `bridgeVersion` 을 올리고 메서드를
추가하는 방식으로만 한다.

## 5. 배포 전 확인

웹을 배포하면 앱도 같이 바뀐다. 앱 셸에서 주요 흐름(입장 → 프로필 선택 → 홈 →
상세 → Plex 열기 → 알림)을 한 번 확인하고 배포한다. 실무에서 사고가 가장 자주 나는
지점이라 셸 명세도 이걸 별도로 짚고 있다.
