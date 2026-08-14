import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ExternalLink, MessageCircle } from 'lucide-react'

// 이용 방법 안내. 입장 화면에서 들어오므로 아직 아무 관문도 통과하지 않은 사람이
// 본다 — proxy.ts 의 PUBLIC_PATHS 에 함께 올려 두었다.

export const metadata: Metadata = { title: '이용 방법' }

const IOS_VPN_URL =
  'https://apps.apple.com/kr/app/vpn-cat-%EB%B9%A0%EB%A5%B4%EA%B3%A0-%EC%95%88%EC%A0%84%ED%95%9C-%EB%AC%B4%EC%A0%9C%ED%95%9C/id1134784923'
const ANDROID_VPN_URL =
  'https://play.google.com/store/apps/details?id=free.vpn.unblock.proxy.turbovpn'
const PLEX_IOS_URL = 'https://apps.apple.com/app/plex/id383457673'
const PLEX_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.plexapp.android'
const KAKAO_CHANNEL_URL = 'http://pf.kakao.com/_hmTNK'

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <Link
        href="/welcome"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        돌아가기
      </Link>

      <h1 className="mt-6 text-2xl font-black tracking-tight text-foreground">
        이용 방법 : NUPLEX 가입 및 이용 방법
      </h1>

      <ol className="mt-8 space-y-7">
        <Step n={1} title="가입 요청">
          <p>
            <strong className="text-foreground">Gmail 주소</strong>가 필요합니다. 없으면 먼저
            하나 만들어 주세요. 그 주소를 아래 채널로 알려주시면 초대를 보내드립니다.
          </p>
          <Outbound href={KAKAO_CHANNEL_URL}>NUPLEX 채널로 요청하기</Outbound>
        </Step>

        <Step n={2} title="VPN 설치">
          <p>
            초대 메일은 해외에서 열어야 정상 작동하므로, VPN 설치가{' '}
            <strong className="text-foreground">한 번만</strong> 필요합니다. 아래 무료 VPN 앱 또는
            사용중인 VPN 앱을 폰에서 설치 후 가능하면 지역을 미국으로 설정해주세요.
          </p>
          <Outbound href={IOS_VPN_URL}>아이폰 / 아이패드 — VPN cat</Outbound>
          <Outbound href={ANDROID_VPN_URL}>안드로이드 — Turbo VPN</Outbound>
        </Step>

        <Step n={3} title="VPN 을 켠 채로 Gmail 로그인">
          <p>VPN 이 연결된 상태에서 Gmail 에 로그인해 받은 편지함을 엽니다.</p>
        </Step>

        <Step n={4} title="Plex 메일 두 통을 순서대로 확인">
          <p>
            Plex 에서 메일이 <strong className="text-foreground">두 통</strong> 옵니다. 먼저 온
            것부터 열어 <strong className="text-foreground">초대(Invite) 링크 · 버튼</strong>을
            눌러 가입을 마쳐 주세요. 두 통 모두 눌러야 합니다.
          </p>
          <Dots items={['메일이 안 보이면 스팸함도 확인해 주세요']} />
        </Step>

        <Step n={5} title="가입 정상 확인">
          <p>정상적으로 가입 되었는지 관리자에게 확인하시기 바랍니다.</p>
        </Step>

        <Step n={6} title="VPN 끄기 & 제거">
          <p>가입이 완료되면 VPN은 끄거나 설치 제거하셔도 됩니다.</p>
        </Step>

        <Step n={7} title="Plex 앱 설치하고 Google로 로그인">
          <Dots
            items={[
              '시청할 환경에서 Plex 앱을 설치하세요',
              'Google로 계속하기를 눌러 방금 초대받은 Gmail 계정으로 로그인하세요.',
            ]}
          />
          <Outbound href={PLEX_IOS_URL}>아이폰 / 아이패드</Outbound>
          <Outbound href={PLEX_ANDROID_URL}>안드로이드</Outbound>
          <Dots items={['TV : 각 TV에 내장된 앱 스토어에서 Plex를 검색하세요']} />
        </Step>
      </ol>

      <div className="mt-10 space-y-2.5">
        <a
          href={KAKAO_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-transparent px-4 py-3.5 text-base font-bold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MessageCircle className="h-5 w-5" />
          채널 이용 문의
        </a>
        <Link
          href="/welcome"
          className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground transition hover:brightness-110"
        >
          NUPLEX 로 돌아가기
        </Link>
      </div>
    </main>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  )
}

/** 줄머리에 금색 가운데점을 다는 설명 묶음 */
function Dots({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="text-primary">
            ·
          </span>
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Outbound({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
    >
      {children}
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  )
}
