# Firebase 설정 (푸시 알림)

푸시를 실제로 보내려면 Firebase 프로젝트와 서비스 계정 키가 필요하다.
지금은 키가 없어도 앱이 돌아간다 — 알림은 `pending` 으로 쌓여 있다가 키를 넣으면 나간다.

**돈은 안 든다.** FCM 은 무료이고 한도도 개인 서비스에서는 닿을 일이 없다.
다만 iOS 는 **Apple Developer Program(연 $99)** 이 있어야 푸시를 테스트할 수 있다.

## 순서

### 1. Firebase 프로젝트 만들기 (5분)

1. <https://console.firebase.google.com> 접속 → 구글 계정 로그인
2. **프로젝트 만들기** → 이름 `nuplex` → 계속
3. **Google 애널리틱스는 사용 안 함**으로 두면 된다. 푸시에 필요 없고 설정만 늘어난다
4. 만들어지면 프로젝트 개요 화면으로 들어간다

### 2. 서비스 계정 키 받기 (웹서버가 쓸 열쇠, 3분)

이게 **nuplex 웹이 필요로 하는 유일한 값**이다.

1. 좌측 상단 톱니바퀴 → **프로젝트 설정**
2. **서비스 계정** 탭
3. **새 비공개 키 생성** → 확인 → JSON 파일이 내려받아진다
4. 파일 안은 이렇게 생겼다. `project_id` · `client_email` · `private_key` 세 개를 쓴다

```json
{
  "type": "service_account",
  "project_id": "nuplex-xxxxx",
  "client_email": "firebase-adminsdk-xxxxx@nuplex-xxxxx.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n"
}
```

> **이 파일은 비밀번호와 같다.** 저장소에 커밋하지 말고, 슬랙·메일로 보내지 말 것.
> 유출되면 Firebase 콘솔에서 해당 키를 삭제하고 새로 만들면 된다.

### 3. NAS 의 `.env` 에 넣기

JSON 을 한 줄로 만들면 개행 때문에 깨지기 쉽다. **base64 로 바꿔 넣는 걸 권한다.**

```bash
# 내려받은 파일을 base64 한 줄로
base64 -i ~/Downloads/nuplex-xxxxx-firebase-adminsdk.json | tr -d '\n'
```

출력된 한 줄을 NAS 의 `.env` 에 붙인다.

```
FCM_SERVICE_ACCOUNT=ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAg...
```

그리고 재기동한다.

```bash
cd /volume1/Develop/webapps/nuplex && ./compose.sh restart
```

**주의**: `.env` 값에 `$` 가 들어가면 docker compose 가 변수로 해석해 값을 망가뜨린다
(AGENTS.md §4). base64 에는 `$` 가 안 나오므로 이 방식이 안전하다.

확인:

```bash
curl -s https://nuplex.nugabox.com/api/app/config | grep pushEnabled
# "pushEnabled": true  가 나오면 성공
# false 라면 .env 의 APP_PUSH_ENABLED 가 0 인지도 함께 확인할 것
```

### 4. 여기까지가 웹 몫

이후는 **앱(`nuplex-app`) 작업**이다. 앱을 만들 때 필요한 것들:

| 필요한 것 | 어디서 | 무엇에 쓰나 |
|---|---|---|
| `google-services.json` | Firebase 콘솔 → Android 앱 추가 | Android 앱에 넣는다 |
| `GoogleService-Info.plist` | Firebase 콘솔 → iOS 앱 추가 | iOS 앱에 넣는다 |
| APNs 인증 키 `.p8` | Apple Developer → Keys | Firebase 에 업로드 |

Android 앱 추가 시 패키지 이름은 `com.nugabox.nuplex`(셸 명세 가정값)로 맞춘다.

**APNs 키(.p8)는 한 번만 내려받을 수 있다.** 재다운로드가 안 되니 만들자마자
안전한 곳에 보관할 것. 잃어버리면 키를 폐기하고 새로 만들어야 한다.

이 세 파일은 **모두 저장소에 커밋하지 않는다.** `nuplex-app` 의 `.gitignore` 에
이미 들어가 있어야 한다.

## 밀린 알림 보내기

키를 나중에 넣었다면, 그동안 쌓인 `pending` 을 다시 보낼 수 있다.

```bash
docker exec -it nuplex-web-1 node -e "require('./lib/devices').retryPending()"
```

다만 지난 알림이 한꺼번에 날아가는 게 보통은 반갑지 않다. 그냥 두고 다음 알림부터
나가게 하는 편이 낫다 — 대기 레코드는 기록으로 남는다.

## 자주 막히는 곳

| 증상 | 원인 |
|---|---|
| `pushEnabled: false` | `.env` 값이 안 읽혔다. base64 가 중간에 잘렸는지 확인 |
| `FCM 토큰 발급 실패 401` | 서비스 계정 키가 다른 프로젝트 것이거나 폐기됨 |
| Android 만 오고 iOS 는 안 옴 | APNs `.p8` 을 Firebase 에 안 올렸다 |
| 알림은 오는데 눌러도 홈만 뜸 | 셸의 콜드 스타트 라우팅 문제(앱 쪽 `pending-queue`) |
| 아이콘이 회색 사각형 | Android 전용 흰색 실루엣 아이콘이 없다(앱 쪽) |
