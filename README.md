# NUPLEX

개인 Plex 라이브러리를 넷플릭스처럼 둘러보는 웹 카탈로그.
검색하고 상세를 보다가 **"Plex에서 보기"** 를 누르면 재생은 Plex 가 맡는다.

지연을 없애려고 화면은 Plex 를 호출하지 않는다. `sync` 워커가 주기적으로 Plex 를 읽어
PostgreSQL 과 로컬 이미지 파일에 복사해 두고, 화면은 그것만 읽는다.
자세한 이유는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 처음 띄우기

```bash
cp .env.example .env          # 값을 채운다 (아래 표 참고)
./compose.sh migrate          # DB 스키마 적용
./compose.sh up               # web(2620) · sync · db(2621) 기동
```

`sync` 는 기동 시 성공 이력이 없으면 전체 동기화를 한 번 돌린다.
라이브러리가 크면 시간이 걸린다 — 진행 상황은 `./compose.sh logs sync -f`.

### 반드시 채워야 하는 값

| 키 | 얻는 곳 |
|---|---|
| `PLEX_TOKEN` | Plex 웹 → 아무 항목 ⋯ → Get Info → View XML → 주소창의 `X-Plex-Token` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | 아무 값. 단 `$` 를 넣지 말 것 |
| `POSTGRES_PASSWORD` | 아무 값. 단 `$` 를 넣지 말 것(compose 가 변수로 해석한다) |

Plex 쪽에서 사람이 해줘야 하는 설정은 [docs/PLEX-SETUP.md](docs/PLEX-SETUP.md).

## 명령

```bash
./compose.sh up               # 운영 모드
./compose.sh --dev up         # 개발 모드 (핫리로드)
./compose.sh down
./compose.sh restart          # 재빌드 후 재기동
./compose.sh migrate          # database/*.sql 중 미적용분만
./compose.sh sync             # 증분 동기화를 지금 한 번
./compose.sh sync --full      # 전체 동기화 (삭제 감지 포함)
./compose.sh logs sync -f
```

`docker compose` 를 직접 부르지 않는다.

## 포트

| 포트 | 용도 |
|---|---|
| 2620 | web — 유일한 외부 접속 포트 |
| 2621 | PostgreSQL 17 |

## 문서

| 파일 | 내용 |
|---|---|
| [AGENTS.md](AGENTS.md) | 작업 지침 · 프로젝트 사실 · 함정 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조와 그렇게 만든 이유 |
| [docs/SYNC.md](docs/SYNC.md) | 동기화 주기 · 재개 · 삭제 감지 · 이미지 |
| [docs/PLEX-SETUP.md](docs/PLEX-SETUP.md) | Plex 설정 · 토큰 · 쓰는 엔드포인트 |
| [docs/SECURITY.md](docs/SECURITY.md) | 비밀번호 · 세션 · 토큰 취급 |
