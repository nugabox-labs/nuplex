import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: 'NUPLEX 로그인',
}

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
      </div>
    </main>
  )
}
