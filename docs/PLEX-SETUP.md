# Plex 쪽 준비

## 서버 정보 (확인 완료)

```
GET https://plex.nugabox.com/identity   → 200 (인증 불필요)
machineIdentifier  4962aaf03eed5e9749e2ae3050c7c5d6af8fc1cd
apiVersion         1.2.2
version            1.43.3.10861
claimed            true
```

리버스 프록시가 PMS 를 그대로 노출하고 있다. `machineIdentifier` 는 딥링크 생성에 쓰며
`.env` 의 `PLEX_SERVER_ID` 가 이 값이다.

## 사람이 해야 하는 일

| # | 할 일 | 왜 |
|---|---|---|
| 1 | 토큰 발급 → `.env` 의 `PLEX_TOKEN` | 서버 접근에 필수. Plex 웹에서 아무 항목 → ⋯ → Get Info → View XML → 주소창의 `X-Plex-Token` 값 |
| 2 | 설정 → 네트워크 → Custom server access URLs 에 `https://plex.nugabox.com:443` | plex.tv 가 이 주소를 광고하게 한다 |
| 3 | 설정 → 네트워크 → Secure connections = Preferred | 프록시가 TLS 종단이라 Required 면 내부 경로가 깨질 수 있다 |
| 4 | 라이브러리 메타데이터 새로고침 · 포스터가 채워졌는지 확인 | 화면이 전부 `thumb`/`art` 기반이다 |
| 5 | **"인증 없이 허용할 IP/네트워크" 는 건드리지 말 것** | 우리는 토큰으로 붙는다. 여기를 열면 도메인이 통째로 무인증 노출된다 |

토큰이 유출되면 Plex 계정에서 기기를 해제해 무효화한 뒤 새로 발급받고 `.env` 만 바꾸면 된다.

## 쓰는 엔드포인트

모든 요청에 `Accept: application/json` 을 붙인다. **안 붙이면 Plex 는 XML 을 준다.**
인증은 `X-Plex-Token` 헤더로 한다(쿼리스트링에 싣지 않는다).
`X-Plex-Client-Identifier` 는 이 앱을 식별하는 고정 UUID 로, `.env` 의 `PLEX_CLIENT_ID` 다.

| 엔드포인트 | 용도 |
|---|---|
| `/identity` | 서버 확인. 인증 불필요 |
| `/library/sections` | 섹션 목록. `type` 이 `movie`/`show` 인 것만 쓴다 |
| `/library/sections/{key}/all` | 섹션 항목. `X-Plex-Container-Start` · `-Size` 로 200건씩 페이징 |
| 〃 + `updatedAt>=` | 증분 조회. **비교 연산자가 파라미터 이름에 붙는 문법**이다 |
| `/library/metadata/{key}` | 상세. 출연진(`Role`) · 감독(`Director`) · 각본(`Writer`) |
| `/library/metadata/{key}/children` | 시리즈의 시즌 목록 |
| `/library/metadata/{key}/allLeaves` | 시리즈의 전체 에피소드. **시즌마다 부르지 않는다** |
| `/photo/:/transcode?url=…&width=&height=` | 이미지를 필요한 크기로 받는다 |

딥링크는 API 가 아니라 웹 앱 주소다:
```
https://app.plex.tv/desktop/#!/server/{machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}
```
모바일 기기에서는 설치된 Plex 앱이 이 주소를 가로챈다.

## 안 쓰는 것

- **plex.tv PIN 로그인**: 사용자별 Plex 계정 로그인. 지금은 공통 비밀번호 하나라 필요 없다.
  나중에 계정별 시청기록을 붙일 때 다시 검토한다.
- **재생 · 트랜스코딩 API**: 재생은 Plex 로 넘긴다. 앱 안에서 재생하지 않는다.
