# AGENTS.md — NUPLEX

## 0. 이 문서 사용법
작업 시작 전 이 파일만 읽는다. 상세가 필요하면 §5 문서 지도에서 해당 파일 하나만 골라 읽는다.
docs/ 전체를 읽지 말 것.

## 1. 행동 지침 (모든 작업에 적용)

### 1.1 코딩 전에 생각한다
가정하지 않는다. 혼란을 숨기지 않는다. 트레이드오프를 드러낸다.
- 가정은 명시한다. 불확실하면 묻는다.
- 해석이 여럿이면 전부 제시한다. 조용히 하나를 고르지 않는다.
- 더 단순한 방법이 있으면 말한다. 필요하면 반대 의견을 낸다.
- 불명확하면 멈춘다. 무엇이 혼란스러운지 이름 붙이고 묻는다.

### 1.2 단순함 우선
문제를 푸는 최소한의 코드. 추측성 코드 금지.
- 요청 범위를 넘는 기능 금지 / 1회용 코드에 추상화 금지
- 요청하지 않은 "유연성" · "설정 가능성" 금지 / 불가능한 시나리오의 예외 처리 금지
- 200줄을 썼는데 50줄로 되면 다시 쓴다.
- 자문: "시니어 엔지니어가 이걸 과하다고 할까?" → 그렇다면 단순화한다.

### 1.3 외과적 변경
꼭 필요한 것만 건드린다. 내가 만든 쓰레기만 치운다.
- 주변 코드 · 주석 · 포매팅을 "개선"하지 않는다 / 멀쩡한 것을 리팩터링하지 않는다
- 내 취향과 달라도 기존 스타일을 따른다 / 무관한 죽은 코드는 **언급만** 하고 지우지 않는다
- 내 변경으로 고아가 된 import · 변수 · 함수는 제거한다
- 기준: 변경된 모든 줄이 사용자의 요청으로 직접 추적되어야 한다.

### 1.4 목표 기반 실행
성공 기준을 정의하고, 검증될 때까지 반복한다.
- 다단계 작업은 짧은 계획을 먼저 선언한다: `1. [단계] → verify: [확인]` 형식

**트레이드오프:** 이 지침은 속도보다 신중함에 치우쳐 있다. 사소한 작업에는 판단력을 쓴다.

## 2. 항상 적용 (docs를 열기 전에도 지킨다)
- **DB**: CREATE/ALTER는 사람 컨펌 전 금지. 산출물은 `database/` 만.
- **DB는 대부분 Plex 의 사본이다**: 아래 목록을 빼면 모든 행을 sync 워커가 다시 만들 수 있다.
  사람이 만드는 데이터는 동기화로 복구되지 않는다 — **백업 대상은 이것뿐이다.**
  · `notice` · `notice_target` — 알림
  · `profile` — 표시 이름 · 이메일 보정 · 노출 여부
  · `featured_series` — 연재 중인 시리즈 (`database/0005_featured_series.sql`)
  · `conversation` · `message` · `conversation_read` — 채팅 (`docs/CHAT.md`)
  (`watch_history` 는 Plex 사본이라 여기 없다 — sync 가 다시 받아온다)
  이 목록을 늘리는 테이블(찜 목록 등)을 더 추가하려면 먼저 상의한다.
- **라이브러리 분류는 Plex 것을 그대로 쓴다**: 섹션 제목 `구분 | 하위`(예: `영화 | 한국`)가
  곧 메뉴 계층이다. 우리가 새로 묶거나 이름을 바꾸지 않는다. 안 보일 섹션은 코드가 아니라
  `.env` 의 `EXCLUDED_SECTION_IDS` 로 뺀다.
- **관문은 프로필 하나다**: 열람용 공통 비밀번호는 없앴다. 입장 화면(`/welcome`)은
  아무것도 묻지 않고, 프로필을 처음 고를 때 그 사람의 가입 이메일을 한 번 확인해
  1년 쿠키에 담는다. "나가기" 를 누르기 전까지 다시 묻지 않는다.
- **관리자 비밀번호는 별개다**(`ADMIN_PASSWORD`). 이메일만 맞히면 들어오는 자리라
  그걸로 알림까지 보낼 수 있으면 안 된다.
- **앱과의 계약을 함부로 깨지 않는다**: `/api/app/*` 와 푸시 페이로드는 구버전 셸도
  쓴다. 필드를 없애지 말고 추가만 한다 — `docs/APP-INTEGRATION.md` §4.
- **Plex 호출은 sync 워커에서만**: 화면을 그리는 길에서는 Plex 를 절대 부르지 않는다.
  화면 지연을 없애려고 만든 구조다. 화면에서 Plex 를 부르는 코드가 생기면 그 순간 설계가 무너진다.
  **예외는 관리자가 누르는 동작 하나뿐이다** — 라이브러리 스캔(`/api/admin/scan`).
  렌더링이 아니라 버튼을 눌렀을 때만 나가므로 보는 사람의 화면은 여전히 DB 만 읽는다.
- **네트워크**: 서비스는 `0.0.0.0` 바인딩. localhost 고정 금지.
- **환경**: `.env` 값은 dev/prod 동일. 예외는 `PLEX_BASE_URL` 하나다 — 운영은 서버와
  같은 망이라 사설 IP 를 써서 동기화를 빠르게 한다. **화면에 나가는 Plex 링크는
  `PLEX_PUBLIC_URL` 로 만든다.** 사설 IP 를 링크에 박으면 밖에서 열리지 않는다.
- **비밀**: 비밀번호 · 토큰 하드코딩 금지. `.env` 커밋 금지.
  `.env` 값에 `$` 를 넣지 않는다 — docker compose 가 변수로 해석해 버린다(§4).
- **기동**: `compose.sh` 로만. `docker compose` 직접 호출 금지.
- **시간 · 인코딩**: 전 구간 KST(Asia/Seoul) · UTF-8.
- **언어**: 화면 텍스트 · 주석 · 커밋 · 문서 전부 한국어.
- **표기**: 가운데점은 항상 앞뒤에 공백을 둔다 — `제목 · 상태 · 계층`처럼 쓰고, 붙여 쓰지 않는다.
  예외는 줄머리 글머리표로 쓴 `· 항목` 하나뿐이다.
- **인증**: 앱 전체가 프로필 쿠키 뒤에 있다. 포스터 이미지(`/media/*`)도 예외가 아니다.
  단 `/media/avatars` 는 열려 있다 — 프로필 선택 화면이 그걸 보여줘야 한다.
- **Route Handler 런타임**: `node:crypto` · `node:fs` · DB 를 쓰는 라우트는
  `export const runtime = 'nodejs'` 를 명시한다(Edge 기본값 금지).

## 3. 프로젝트 사실 (변경 시 여기부터 고친다)

| 항목 | 값 |
|---|---|
| 제목 | NUPLEX |
| 무엇인가 | 개인 Plex 라이브러리를 넷플릭스처럼 둘러보는 카탈로그. 재생은 하지 않고 Plex 로 넘긴다 |
| 루트 경로 | `/Users/ngjang/Development.localized/Workspaces/nugabox-labs/nuplex` |
| 운영 배포 경로 | `/volume1/Develop/webapps/nuplex` |
| Runner 라벨 | `[self-hosted, linux, x64, nugacloud]` |
| 포트 | 접속 2620, 나머지 전부 2621–2629 |
| Plex 서버 | `https://plex.nugabox.com` · machineIdentifier `4962aaf03eed5e9749e2ae3050c7c5d6af8fc1cd` |
| DB | PostgreSQL 17, UTF-8 + ICU 한국어(`ko-KR`) 정렬 |
| 언어 | TypeScript, Next.js 16 App Router |
| 인증 | 프로필 가입 이메일 확인 + HMAC 서명 프로필 쿠키 1년 (관리자만 별도 비밀번호) |
| 라이브러리 | 영화 1,544 · 시리즈 453 · 에피소드 17,903 · 컬렉션 76 (2026-08-12 기준) |
| 이미지 | sync 가 미리 받아 `./data/media` 에 저장, `/media/<파일명>` 으로 서빙. git 발행 없음 |
| 기동 | `compose.sh` 를 통해서만 |

### 포트 배치
| 포트 | 용도 |
|---|---|
| 2620 | web (Next.js) — 유일한 외부 접속 포트, 역방향 프록시 대상 |
| 2621 | PostgreSQL 17 |
| 2622–2629 | 예약 (신규 서비스는 이 범위에서만 배정) |

sync 워커는 포트를 열지 않는다.

### 컨테이너 구성
| 서비스 | 역할 |
|---|---|
| `web` | 화면. DB 와 로컬 이미지만 읽는다 |
| `sync` | 30분마다 증분 · 매일 04:00 전체 동기화. Plex 토큰을 쥔 유일한 컨테이너 |
| `db` | PostgreSQL 17 |

## 4. 제약과 함정
- 포트는 2620–2629 범위 밖으로 나가지 않는다
- `compose.dev.yml` 에 `ports:` 금지 (Compose는 포트 목록을 append하므로 이중 바인딩 실패)
- **`.env` 값에 `$` 를 쓰면 안 된다.** docker compose 는 `env_file` 값도 변수 치환한다 —
  scrypt 해시 구분자를 `$` 에서 `:` 로 바꾼 이유가 이것이다. 실제로 겪었다
- `POSTGRES_INITDB_ARGS` 는 최초 initdb에만 적용 → 정렬 설정 변경은 덤프/복원 필요
- self-hosted runner umask 때문에 static 파일 403 → `docker/Dockerfile` COPY 후 `chmod -R a+rX`
- 배포 git 명령에 `-c safe.directory` 필수
- Next.js standalone 서버(`node server.js`)는 `-p`/`-H` 같은 CLI 플래그를 읽지 않는다. 포트 · 호스트는
  `docker/Dockerfile` 의 `PORT`/`HOSTNAME` 환경변수로만 바뀐다
- `compose.dev.yml`의 `node_modules` 익명 볼륨은 이미지를 다시 빌드해도 **재사용**된다.
  `compose.sh` 는 항상 `--renew-anon-volumes` 를 붙인다
- **화면 페이지는 전부 `export const dynamic = 'force-dynamic'`.** 정적 프리렌더를 켜면
  `npm run build` 가 빌드 시점에 DB 에 붙으려다 죽는다(Docker 빌드에는 DB 가 없다)
- **라우트 안에서 `path.join(process.cwd(), …)` 을 쓰지 않는다.** Turbopack 트레이서가 이걸 보면
  프로젝트 전체를 standalone 출력에 끌고 들어온다(36MB → 소스 통째). `/media` 라우트는 그래서
  경로를 문자열로 조립하고 세그먼트를 정규식으로 검사한다
- DB 클라이언트(`lib/db/index.ts`)는 첫 쿼리 시점까지 연결을 미루는 Proxy 다. DB 를 쓰는 모듈을
  새로 추가할 때도 이 패턴을 따를 것(빌드 타임엔 안 쓰이고 런타임에만 필요한 값을 모듈 최상단에서
  검증하지 않기)
- **Plex 필터에 `URLSearchParams` 를 쓰면 안 된다.** 필터 문법은 비교 연산자가 파라미터 이름에
  붙는 형태(`updatedAt>=123`)인데 `>=` 가 퍼센트 인코딩되면 **Plex 가 필터를 조용히 무시하고
  전체를 돌려준다**(에러가 아니라 200 이다). 실측으로 잡았다 — 증분 동기화가 매번 1,997건을
  다시 훑고 있었다. 고친 뒤 0건 · 1초. `lib/plex/client.ts` 의 `plexGet` 은 이름을 날것으로 두고
  값만 인코딩한다
- **남의 재생 위치(viewOffset)는 못 가져온다.** `/library/onDeck` 은 `accountID` 를 조용히
  무시하고 관리자 본인의 이어보기를 돌려준다(실측). 공유 친구의 토큰은 얻을 방법이 없다.
  시청 **기록**은 `/status/sessions/history/all?accountID=` 로 전부 받을 수 있어서, 홈의
  "이어서 보기" 는 "몇 분 남음" 이 아니라 **마지막으로 본 화의 다음 화**로 만들었다
- **컬렉션 소속은 컬렉션 → `/children` 방향으로만 채운다.** 작품 상세의 `Collection` 필드가
  주는 id 는 컬렉션 `ratingKey` 가 아니라 별개의 태그 id 라서(82755 ↔ 100432), 그걸로 맞추면
  에러 없이 0건이 붙는다
- **`metadataBase` 를 지정하지 않으면 OG 이미지가 `localhost:3000` 으로 나간다.** 카카오톡
  링크 미리보기에 이미지가 안 뜬다. `.env` 의 `SITE_URL` 을 운영 도메인으로 둘 것
- 에피소드는 시즌마다 부르지 않고 `/library/metadata/{key}/allLeaves` 로 한 번에 받는다.
  드라마가 많은 라이브러리에서 시즌 단위 호출은 곧바로 수천 건이 된다
- Next.js 16 에서 `middleware.ts` 파일 규약은 `proxy.ts` 로 바뀌었다(export 이름도 `proxy`)
- **`'server-only'` 가 걸린 모듈(`lib/library.ts` · `lib/notices.ts`)을 sync 워커가 import 하면
  즉시 죽는다.** 워커는 Next.js 없이 도는 순수 Node 다. 양쪽이 같이 쓰는 헬퍼는
  `lib/plex/client.ts` 처럼 중립 모듈에 둔다(`excludedSectionIds` 가 그래서 거기 있다)

## 5. 문서 지도 — 명령을 받으면 여기서 **읽을 파일 1~2개만** 고른다

| 파일 | 이럴 때 읽는다 |
|---|---|
| `docs/ARCHITECTURE.md` | 시스템 전체 구성, 컨테이너 경계, 데이터 흐름을 바꿀 때 |
| `docs/SYNC.md` | 동기화 주기 · 재개 · 삭제 감지 · 이미지 저장을 손댈 때 |
| `docs/PLEX-SETUP.md` | Plex 쪽 설정 · 토큰 발급 · API 엔드포인트를 확인할 때 |
| `docs/SECURITY.md` | 비밀번호 · 세션 · 공개 범위를 손댈 때 |
| `docs/NOTICES.md` | 알림 · 관리자 화면 · 프로필별 발송을 손댈 때 |
| `docs/CHAT.md` | 채팅 · SSE 실시간 전송 · 채팅 푸시를 손댈 때 |
| `docs/APP-INTEGRATION.md` | 앱(nuplex-app)과의 계약 · 푸시 페이로드를 손댈 때 |
| `docs/FIREBASE-SETUP.md` | 푸시 자격증명을 설정할 때 |
| `database/*.sql` | 스키마 확인. 마이그레이션은 파일명 순으로 한 번씩만 적용된다 |

**중복 금지 규칙:** 같은 사실은 한 파일에만 쓴다. 다른 곳에서는 상대 링크로 참조한다.

## 6. 열린 질문
- 재생을 앱 안에서 할 것인가(HLS 자체 플레이어)는 보류. 현재는 Plex 딥링크로만 넘긴다.
- iOS · Android 앱은 이후 단계. 지금 구조(웹 = DB 읽기 전용)라면 같은 DB 앞에 읽기 API 를
  붙이는 것으로 확장한다.
