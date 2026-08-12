'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { Profile } from '@/lib/profiles'
import { cn } from '@/lib/utils'

// 프로필을 고르고, 처음이면 그 사람의 가입 이메일을 한 번 확인한다.
// 통과하면 1년짜리 쿠키에 담긴다 — 로그아웃하지 않는 한 다시 묻지 않는다.

export function ProfilePicker({ profiles }: { profiles: Profile[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    setPending(true)
    setError(null)

    const res = await fetch('/api/profile/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: selected.id, email }),
    })

    if (res.ok) {
      router.replace('/')
      router.refresh()
      return
    }
    setError(((await res.json().catch(() => null)) as any)?.error ?? '확인하지 못했습니다.')
    setPending(false)
  }

  if (selected) {
    return (
      <form onSubmit={confirm} className="mx-auto w-full max-w-sm">
        <button
          type="button"
          onClick={() => {
            setSelected(null)
            setEmail('')
            setError(null)
          }}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          다른 프로필 고르기
        </button>

        <div className="flex flex-col items-center">
          <Avatar profile={selected} size="lg" />
          <p className="mt-4 text-xl font-bold text-foreground">{selected.name}</p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            처음이시네요. 본인 확인을 위해 Plex 가입 이메일을 입력해 주세요.
          </p>
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoFocus
          autoComplete="email"
          className="mt-6 w-full rounded-md border border-border bg-secondary/60 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <button
          type="submit"
          disabled={pending || email.trim().length === 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          확인
        </button>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-start justify-center gap-6 md:gap-10">
      {profiles.map((profile) => (
        <button
          key={profile.id}
          type="button"
          onClick={() => setSelected(profile)}
          className="group flex w-24 flex-col items-center gap-3 focus:outline-none md:w-28"
        >
          <Avatar profile={profile} />
          <span className="truncate text-sm text-muted-foreground transition group-hover:text-foreground">
            {profile.name}
          </span>
        </button>
      ))}
    </div>
  )
}

/** 아바타가 없는 사람이 있다(서버 접속 이력만 있는 계정). 이름 첫 글자로 대신한다. */
function Avatar({ profile, size = 'md' }: { profile: Profile; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-24 w-24 text-3xl md:h-28 md:w-28'

  return (
    <span
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg border-2 border-transparent bg-secondary font-bold text-muted-foreground transition',
        size === 'md' && 'group-hover:border-primary group-focus-visible:border-primary',
        box,
      )}
    >
      {profile.avatar ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        profile.name.slice(0, 1)
      )}
    </span>
  )
}
