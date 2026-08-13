import Link from 'next/link'
import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { safeNext } from '@/lib/utils'

// 입장 화면. 여기서는 아무것도 묻지 않는다 — 관문은 프로필을 처음 고를 때
// 확인하는 가입 이메일 하나뿐이다(docs/SECURITY.md).
//
// 배경은 검정 + 금색 무대 사진이다. 화면 비율에 따라 세로 · 가로 두 장을 나눠 쓴다.
// 글씨가 묻히지 않도록 위에 어두운 그러데이션을 한 겹 덮는다.

export const metadata: Metadata = { title: 'NUPLEX' }

// 앱 내려받기 — NUPLEX 앱이 나오기 전까지는 재생을 맡고 있는 Plex 앱으로 보낸다.
// 출시되면 이 주소 두 개와 버튼 아래 안내 문구만 바꾸면 된다. 버튼 문구는
// 앱 이름을 담지 않아 그대로 둔다.
const APP_STORE_URL = 'https://apps.apple.com/app/plex/id383457673'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.plexapp.android'

const POINTS = [
  '개인 서버에 모아둔 영화 · 드라마 · 애니 · 예능 · 다큐를 한자리에서 둘러봅니다.',
  '프로필을 고르면 보던 시리즈의 다음 화가 홈에 먼저 뜹니다.',
  '재생은 Plex 앱에서 이어집니다. 새 작품이 올라오면 알림으로 알려드립니다.',
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

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
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
        <p className="mt-3 text-base text-foreground/90">나만의 OTT</p>

        <ul className="mt-10 space-y-3 text-left text-sm leading-relaxed text-muted-foreground">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="text-primary">
                ·
              </span>
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-10 space-y-3">
          <Link
            href={enterHref}
            className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            입장하기
          </Link>
          <a
            href="http://pf.kakao.com/_hmTNK"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-md border border-primary bg-transparent px-4 py-3 text-sm font-bold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            채널 가입 문의
          </a>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StoreLink href={APP_STORE_URL} store="App Store" />
          <StoreLink href={PLAY_STORE_URL} store="Google Play" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          지금은 재생을 맡고 있는 Plex 앱으로 연결됩니다 · NUPLEX 앱은 준비 중입니다
        </p>
      </div>
    </main>
  )
}

function StoreLink({ href, store }: { href: string; store: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${store}에서 앱 내려받기`}
      className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 px-3 py-2.5 text-sm font-medium text-muted-foreground backdrop-blur-sm transition hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Download className="h-4 w-4 shrink-0" />
      {store}
    </a>
  )
}
