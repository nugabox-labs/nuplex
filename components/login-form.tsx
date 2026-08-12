'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

// 열람용 · 관리자용 로그인 화면이 같은 폼을 쓴다. 다른 건 보낼 주소와 성공 후 갈 곳뿐이다.
export function LoginForm({
  endpoint = '/api/auth/login',
  defaultNext = '/',
}: {
  endpoint?: string
  defaultNext?: string
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      // 열린 곳이 외부 주소로 바뀌지 않도록 내부 경로만 받아들인다.
      const next = searchParams.get('next')
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : defaultNext
      router.replace(target)
      router.refresh()
      return
    }

    const body = await res.json().catch(() => null)
    setError(body?.error ?? '로그인에 실패했습니다.')
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="비밀번호"
        autoFocus
        autoComplete="current-password"
        className="w-full rounded-md border border-border bg-secondary/60 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || password.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        입장
      </button>
    </form>
  )
}
