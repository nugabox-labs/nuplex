import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

// 개인정보 처리방침.
//
// App Store · Play Console 이 **로그인 없이 열리는 주소**를 요구한다. 그래서
// proxy.ts 의 PUBLIC_PATHS 에 함께 올려 두었다 — 관문 뒤에 두면 심사자가 못 본다.
//
// 여기 적는 항목은 **database/ 의 스키마와 일치해야 한다.** 늘리거나 줄일 때
// 이 파일도 같이 고친다. 지금 근거는 —
//   plex_account(0003) · profile(0003) · device(0004) · watch_history(0007) · message(0006)

export const metadata: Metadata = { title: '개인정보 처리방침' }

const UPDATED_AT = '2026년 8월 18일'
const CONTACT = 'root@nugabox.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/welcome"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        돌아가기
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-foreground">개인정보 처리방침</h1>
      <p className="mt-2 text-sm text-muted-foreground">최종 수정일 · {UPDATED_AT}</p>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        NUPLEX(이하 &ldquo;서비스&rdquo;)는 초대받은 이용자들이 함께 쓰는 개인 Plex 미디어
        서버의 목록을 둘러보기 위한 앱과 웹입니다. 서비스는 아래에 적은 것 외의 정보를
        수집하지 않으며, 어떤 정보도 판매하거나 광고에 쓰지 않습니다.
      </p>

      <Section title="1. 수집하는 정보">
        <p>
          <strong className="text-foreground">Plex 계정 정보</strong> — 이름, 사용자명,
          이메일 주소, 프로필 사진. 서버 소유자가 라이브러리를 공유한 계정 목록을
          Plex 로부터 받아 저장합니다. 서비스가 직접 회원가입을 받지는 않습니다.
        </p>
        <p>
          <strong className="text-foreground">프로필 설정</strong> — 화면에 표시할 이름,
          홈 화면 줄 순서 등 이용자가 정한 값.
        </p>
        <p>
          <strong className="text-foreground">시청 기록</strong> — 어떤 작품·회차를 언제
          보았는지. Plex 서버가 기록한 것을 가져와 &ldquo;이어서 보기&rdquo; 를 만드는 데
          씁니다.
        </p>
        <p>
          <strong className="text-foreground">기기 정보(앱)</strong> — 앱이 만든 기기
          식별자, 푸시 알림 토큰, 운영체제 종류, 앱 버전, 언어, 시간대. 알림을 보내기
          위한 것이며 알림을 허용하지 않으면 저장하지 않습니다.
        </p>
        <p>
          <strong className="text-foreground">문의 메시지</strong> — 관리자에게 보낸 대화
          내용.
        </p>
        <p>
          서비스는 광고 식별자, 위치 정보, 연락처, 사진첩에 접근하지 않으며 분석·추적
          도구를 넣지 않았습니다.
        </p>
      </Section>

      <Section title="2. 이용 목적">
        <p>
          프로필 확인과 접근 제어, 라이브러리 목록 제공, 이어서 보기 표시, 새 작품·공지
          알림 발송, 문의 응대. 그 밖의 목적으로는 쓰지 않습니다.
        </p>
      </Section>

      <Section title="3. 보관과 파기">
        <p>
          정보는 서버 소유자가 운영하는 서버에 보관합니다. Plex 라이브러리 공유가
          해제되면 해당 계정 정보는 다음 동기화에서 지워집니다. 앱을 삭제하면 기기
          식별자와 알림 토큰은 더 이상 쓰이지 않으며, 발송 실패가 확인되는 대로
          삭제합니다. 그 밖의 정보는 아래 연락처로 요청하시면 지웁니다.
        </p>
      </Section>

      <Section title="4. 제3자 제공">
        <p>
          서비스는 개인정보를 제3자에게 판매하거나 제공하지 않습니다. 다만 다음
          서비스를 이용하는 범위에서 필요한 정보가 전달됩니다.
        </p>
        <p>
          <strong className="text-foreground">Plex</strong> — 계정과 라이브러리, 시청 기록의
          원천입니다. 재생은 Plex 앱에서 이루어지며 그때의 처리는 Plex 의 방침을 따릅니다.
        </p>
        <p>
          <strong className="text-foreground">Google Firebase Cloud Messaging</strong> —
          앱 푸시 알림 전달에만 쓰며, 알림 토큰과 알림 내용이 전달됩니다.
        </p>
      </Section>

      <Section title="5. 이용자의 권리">
        <p>
          자신의 정보 열람·정정·삭제를 요청할 수 있습니다. 앱에서 알림을 끄면 알림
          발송이 중단됩니다. 요청은 아래 연락처로 받습니다.
        </p>
      </Section>

      <Section title="6. 아동의 개인정보">
        <p>
          서비스는 초대받은 이용자만 쓸 수 있으며 만 14세 미만을 대상으로 하지
          않습니다.
        </p>
      </Section>

      <Section title="7. 문의처">
        <p>
          <a
            href={`mailto:${CONTACT}`}
            className="text-primary underline underline-offset-4"
          >
            {CONTACT}
          </a>
        </p>
      </Section>

      <Section title="8. 변경 고지">
        <p>
          내용이 바뀌면 이 페이지의 최종 수정일을 갱신하고, 중요한 변경은 앱 공지로
          알립니다.
        </p>
      </Section>
    </main>
  )
}
