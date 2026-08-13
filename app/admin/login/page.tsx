import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = { title: '관리자 로그인' }

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-black tracking-tight text-foreground">
          관리자
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          알림을 보내려면 관리자 비밀번호가 필요합니다.
        </p>
        <Suspense>
          <LoginForm endpoint="/api/admin/login" defaultNext="/admin/notices" username="root" />
        </Suspense>
      </div>
    </main>
  )
}
