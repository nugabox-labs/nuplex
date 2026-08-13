import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: 'NUPLEX 로그인',
}

// 앱 내려받기 — NUPLEX 앱이 나오기 전까지는 재생을 맡고 있는 Plex 앱으로 보낸다.
// 출시되면 이 주소 두 개와 바로 아래 안내 문구만 바꾸면 된다. 버튼 문구는
// 앱 이름을 담지 않아 그대로 둔다.
const APP_STORE_URL = 'https://apps.apple.com/app/plex/id383457673'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.plexapp.android'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-logo text-center text-4xl font-black tracking-tight">
          <span className="text-foreground">NU</span>
          <span className="text-primary">PLEX</span>
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          나만의 OTT, NUPLEX 작품들을 둘러보세요
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>

        {/* 폼 안이 아니라 밖에 둔다 — 관리자 로그인 화면은 같은 폼을 쓰지만
            이 버튼은 필요 없다. 간격은 폼의 space-y-3 리듬에 맞춘다. */}
        <a
          href="http://pf.kakao.com/_hmTNK"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-transparent px-4 py-3 text-sm font-bold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          NUPLEX 채널 문의
        </a>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StoreLink href={APP_STORE_URL} store="App Store" />
          <StoreLink href={PLAY_STORE_URL} store="Google Play" />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
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
      className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Download className="h-4 w-4 shrink-0" />
      {store}
    </a>
  )
}
