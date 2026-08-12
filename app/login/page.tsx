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
          비밀번호를 입력하면 라이브러리를 둘러볼 수 있습니다.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
