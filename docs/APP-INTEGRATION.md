# 모바일 앱 셸 연동 (nuplex-app)

> `nugabox-labs/nuplex-app` — Capacitor 기반 iOS/Android 셸이 이 웹서비스를 웹뷰로
> 로드한다. 셸이 하는 일은 세 가지뿐이다: 웹뷰 호스팅 · 푸시 알림 · Plex 딥링크.
>
> 계약 문서: [BRIDGE_CONTRACT.md](BRIDGE_CONTRACT.md) (nuplex-app 원본의 사본)

## 작업 분담 — 건드리기 전에 확인할 것

두 갈래 작업이 동시에 진행 중이다. **다른 담당 영역의 파일은 수정하지 않는다.**
새로 맡는 항목이 생기면 이 표에 먼저 줄을 추가하고 시작한다.

| 영역 | 파일 | 담당 | 상태 |
| --- | --- | --- | --- |
| 푸시 DB 스키마 | `database/0004_push.sql` | 푸시 백엔드 | 진행 중 |
| FCM 발송 | `lib/push/` | 푸시 백엔드 | 진행 중 |
| 푸시 토큰 등록/해제 | `app/api/app/push/token/`, `lib/devices.ts` | 푸시 백엔드 | 진행 중 |
| 공지 → 푸시 발송 연결 | `lib/notices.ts`, `app/api/admin/notices/` | 푸시 백엔드 | 미착수 |
| 프로필 | `lib/profiles.ts`, `components/profile-picker.tsx` | 프로필 | 진행 중 |
| **원격 설정 API** | `app/api/app/config/route.ts` | **앱 셸** | 완료 |
| **셸 대응 (뷰포트·캐시)** | `app/layout.tsx`, `next.config.mjs` | **앱 셸** | 완료 |
| 브릿지 계약 문서 | `docs/BRIDGE_CONTRACT.md` | 앱 셸 | 완료 |

`proxy.ts` 는 양쪽이 다 건드린다. **줄 단위로 최소한만 고치고 이 문서에 남길 것.**

- 앱 셸: `PUBLIC_PATHS` 에 `/api/app/config` 추가 (셸은 로그인 전에 호출한다)
- 푸시 백엔드: 토큰 등록 라우트를 어디에 둘지 결정 필요 — 아래 §3 참고

## 1. 원격 설정 — `GET /api/app/config`

셸이 부팅할 때마다 호출한다. **인증 없이** 응답해야 한다. 셸은 로그인 화면에
닿기도 전에 이걸 읽어서 "어느 도메인을 로드할지"와 "이 앱 버전을 계속 써도 되는지"를
판단하기 때문이다.

응답 스키마와 폴백 정책은 [BRIDGE_CONTRACT.md §3](BRIDGE_CONTRACT.md) 에 있다.

값은 전부 환경변수로 조절한다(`.env.example` 참고). 앱 스토어 심사가 끝나기 전에는
`APP_STORE_URL_IOS` / `APP_STORE_URL_ANDROID` 가 비어 있어도 된다 — 셸은 빈 문자열이면
스토어 버튼을 감춘다.

**`APP_MIN_SUPPORTED_VERSION` 은 신중히 올릴 것.** 이 값을 올리는 순간 그 미만 버전의
사용자는 앱이 강제 업데이트 화면에서 멈춘다. 스토어에 새 버전이 실제로 올라간 뒤에
올린다.

## 2. 셸을 위한 웹 쪽 대응

- **`viewport-fit=cover`** (`app/layout.tsx`) — iOS 노치·다이나믹 아일랜드·홈
  인디케이터 영역까지 배경이 차게 한다. 이걸 켰으면 화면 가장자리에 붙는 UI 는
  `env(safe-area-inset-*)` 로 여백을 줘야 잘리지 않는다. Tailwind 로는 `pt-safe` 대신
  `pt-[env(safe-area-inset-top)]` 식으로 쓴다.
- **HTML 응답 `Cache-Control: no-store`** (`next.config.mjs`) — 웹뷰는 브라우저보다
  캐시를 오래 붙든다. 이게 없으면 웹을 배포해도 앱에서는 며칠씩 구버전 UI 가 뜬다.
  해시가 붙은 `_next/static/*` 은 그대로 장기 캐시한다.
- **앱 여부 판별**은 UA 접미사로 한다: `NuplexApp (ios; bridge/1)`.
  공백 개수에 의존하지 말고 정규식으로 파싱할 것.

## 3. 푸시 — 셸이 기대하는 것

셸(`nuplex-app`)이 호출하는 엔드포인트다. 웹 쪽 구현은 진행 중이며, 아래 형태로
확정됐다 (`app/api/app/push/token/route.ts`).

```
POST   /api/app/push/token   { deviceId, token, platform, appVersion?, locale?, timezone? }
                             → { ok: true, profileId }
DELETE /api/app/push/token   { deviceId }        // 로그아웃 시
```

`deviceId` · `token` · `platform` 은 필수이고 빠지면 400 이다. `platform` 은
`'ios' | 'android'` 만 받는다.

`database/0004_push.sql` 의 `device` 테이블이 이 페이로드와 1:1 로 대응한다.
`profile_id` 는 요청 쿠키(`nuplex_profile`)에서 서버가 채운다 — 셸은 프로필을 모른다.

경로가 인증 게이트 뒤에 있어야 한다. 토큰 등록은 로그인 + 프로필 선택을 마친
뒤에 일어나므로 `proxy.ts` 의 기본 동작(전면 인증)이 그대로 맞다. 다만 **로그아웃
직후의 `DELETE` 는 세션이 이미 지워진 뒤에 도착할 수 있다** — 순서를 뒤집거나
(`DELETE` 먼저, 로그아웃 나중), `deviceId` 만으로 지울 수 있게 예외 경로를 두어야 한다.

발송 페이로드는 [BRIDGE_CONTRACT.md §4](BRIDGE_CONTRACT.md) 와
`nuplex-app/docs/PUSH_PAYLOAD.md` 를 따른다. 핵심 두 가지:

- 라우팅에 필요한 값은 **전부 `data` 에** 담는다. iOS 백그라운드에서는 `notification`
  만 오면 앱의 JS 리스너가 호출되지 않는다.
- `route` 는 **경로 문자열**이다 (`/title/12345`). 완전한 URL 을 넣지 않는다.
  셸이 `webBaseUrl` 과 합친다. 도메인이 바뀌어도 과거 알림이 깨지지 않게 하기 위함.

**stale 토큰 정리는 웹 백엔드 책임이다.** 앱을 지운 기기는 셸이 알려줄 방법이 없다.
FCM 이 `UNREGISTERED` / `NOT_FOUND` 를 주면 그 토큰을 죽은 것으로 표시해야 한다
(`lib/push/fcm.ts` 의 `SendResult.unregistered`, `device.revoked_at`).

## 4. 배포 체크리스트에 넣을 것

웹 배포만으로 앱이 깨질 수 있다. 실무에서 사고가 가장 잦은 지점이다.

- [ ] 라우트 경로를 바꿨다면, 과거에 발송된 푸시의 `route` 가 여전히 유효한가?
- [ ] `NuplexNative` 를 호출하는 코드가 있다면 `bridgeVersion` 확인 후 폴백이 있는가?
- [ ] 앱 셸에서 로그인 → 프로필 선택 → 작품 상세 → Plex 이동까지 한 번 확인했는가?
