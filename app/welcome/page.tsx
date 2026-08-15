import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { BookOpen, MessageCircle } from 'lucide-react'
import { isNuplexApp, safeNext } from '@/lib/utils'

// 입장 화면. 여기서는 아무것도 묻지 않는다 — 관문은 프로필을 처음 고를 때
// 확인하는 가입 이메일 하나뿐이다(docs/SECURITY.md).
//
// 배경은 검정 + 금색 무대 사진이다. 화면 비율에 따라 세로 · 가로 두 장을 나눠 쓴다.
// 글씨가 묻히지 않도록 위에 어두운 그러데이션을 한 겹 덮는다.

export const metadata: Metadata = { title: 'NUPLEX' }

// 앱 내려받기 — NUPLEX 앱이 나오기 전까지는 재생을 맡고 있는 Plex 앱으로 보낸다.
// 출시되면 이 주소 두 개만 바꾸면 된다.
const APP_STORE_URL = 'https://apps.apple.com/app/plex/id383457673'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.plexapp.android'

const POINTS = [
  'NUPLEX에서 제공하는 작품들을 둘러보세요. 재생은 Plex 앱에서 이어져요',
  '새로운 작품 알림을 NUPLEX 앱에서 받아보세요',
]

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  // 원래 보려던 곳(채팅 푸시의 `/?chat=12` 등)을 프로필 선택까지 그대로 넘긴다.
  // safeNext 가 외부 주소 · 입장 흐름 · 없어진 옛 경로를 걸러낸다(docs/CHAT.md §5).
  const carried = safeNext((await searchParams).next)
  const enterHref = carried === '/' ? '/profile' : `/profile?next=${encodeURIComponent(carried)}`

  // 앱 안에서는 이미 앱을 쓰고 있는 사람에게 앱을 받으라고 안내하는 셈이라 숨긴다.
  const inApp = isNuplexApp((await headers()).get('user-agent'))

  return (
    <main className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-8">
      <picture aria-hidden>
        <source media="(min-width: 768px)" srcSet="/intro/stage-desktop.webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/intro/stage-mobile.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background"
      />

      <div className="relative w-full max-w-md text-center">
        <h1 className="font-logo text-5xl font-black tracking-tight">
          <span className="text-foreground">NU</span>
          <span className="text-primary">PLEX</span>
        </h1>
        <p className="mt-3 text-lg text-foreground/90">나만의 OTT, 누플렉스</p>

        <ul className="mt-8 space-y-3 text-left text-base leading-relaxed text-muted-foreground">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="text-primary">
                ·
              </span>
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-8 space-y-2.5">
          <Link
            href={enterHref}
            className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            입장하기
          </Link>
          <a
            href="http://pf.kakao.com/_hmTNK"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-md border border-primary bg-transparent gap-2 px-4 py-3.5 text-base font-bold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MessageCircle className="h-5 w-5" />
            채널 이용 문의
          </a>
          <Link
            href="/guide"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-3.5 text-base font-semibold text-foreground backdrop-blur-sm transition hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <BookOpen className="h-5 w-5" />
            이용 방법 안내
          </Link>
        </div>

        {!inApp && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StoreLink href={APP_STORE_URL} store="App Store">
              <AppleLogo />
            </StoreLink>
            <StoreLink href={PLAY_STORE_URL} store="Google Play">
              <PlayStoreLogo />
            </StoreLink>
          </div>
        )}
      </div>
    </main>
  )
}

function StoreLink({
  href,
  store,
  children,
}: {
  href: string
  store: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${store}에서 앱 내려받기`}
      className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 px-3 py-3 text-[15px] font-medium text-muted-foreground backdrop-blur-sm transition hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      {store}
    </a>
  )
}

// 브랜드 로고는 lucide 에 없다(상표라 뺐다). 스토어 배지 대신 글리프만 쓴다.
function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] shrink-0 fill-current">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

function PlayStoreLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] shrink-0 fill-current">
      <path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  )
}
