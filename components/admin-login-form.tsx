'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

// 관리자 로그인 폼. 비밀번호를 받는 화면은 이제 여기 하나뿐이다 —
// 열람은 프로필 이메일이 관문이라 비밀번호를 쓰지 않는다.
export function AdminLoginForm({
  endpoint = '/api/admin/login',
  defaultNext = '/admin/notices',
  username = 'root',
}: {
  endpoint?: string
  defaultNext?: string
  /** 고정된 아이디 칸에 보여주고 함께 보낸다. 서버도 값을 다시 확인한다 */
  username?: string
} = {}) {
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
      body: JSON.stringify(username ? { username, password } : { password }),
    })

    if (res.ok) {
      // 열린 곳이 외부 주소로 바뀌지 않도록 내부 경로만 받아들인다.
      const next = searchParams.get('next')
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : defaultNext
      // 클라이언트 라우팅(router.replace)을 쓰지 않는다. 방금 바뀐 것이 쿠키라서
      // 전체 페이지 이동으로 서버가 새 쿠키로 다시 판단하게 해야 한다.
      // replace 직후 refresh 를 부르면 진행 중인 이동이 취소돼 스피너만 남는다.
      window.location.assign(target)
      return
    }

    const body = await res.json().catch(() => null)
    setError(body?.error ?? '로그인에 실패했습니다.')
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      {/* 아이디는 root 하나뿐이다. disabled 로 두면 값이 제출에 안 실리므로
          readOnly 로 두고 보기에만 잠긴 것처럼 만든다. 서버도 값을 다시 확인한다. */}
      {username ? (
        <input
          type="text"
          value={username}
          readOnly
          tabIndex={-1}
          aria-label="아이디"
          autoComplete="username"
          className="w-full cursor-not-allowed rounded-md border border-border bg-secondary/30 px-4 py-3 text-muted-foreground focus:outline-none"
        />
      ) : null}

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
