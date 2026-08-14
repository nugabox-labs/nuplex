'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { Profile } from '@/lib/profiles'
import { cn, safeNext } from '@/lib/utils'

// 프로필을 고르고, 처음이면 그 사람의 가입 이메일을 한 번 확인한다.
// 통과하면 1년짜리 쿠키에 담긴다 — 로그아웃하지 않는 한 다시 묻지 않는다.

export function ProfilePicker({ profiles }: { profiles: Profile[] }) {
  const searchParams = useSearchParams()
  const [selected, setSelected] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  /** 관리자 프로필로 들어갈 때만 함께 묻는다 */
  const [adminPassword, setAdminPassword] = useState('')
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
      body: JSON.stringify({ profileId: selected.id, email, adminPassword }),
    })

    if (res.ok) {
      // 원래 보려던 곳이 있으면 그리로 간다(채팅 푸시의 `/?chat=12` 등).
      // safeNext 가 외부 주소 · 입장 흐름 · 없어진 옛 경로를 걸러낸다.
      const target = safeNext(searchParams.get('next'))
      // 프로필 쿠키가 새로 생겼다. 전체 페이지 이동이라야 프록시가 이걸 보고
      // 통과시킨다 — 클라이언트 라우팅으로는 선택 화면으로 되돌아온다.
      // 셸이 이 이동을 신호로 푸시 토큰을 다시 등록한다(nuplex-app BRIDGE_CONTRACT §6).
      window.location.assign(target)
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
            setAdminPassword('')
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
            가입한 이메일을 입력하세요
          </p>
          {selected.maskedEmail ? (
            <p className="mt-1 font-mono text-sm tracking-wide text-primary">
              {selected.maskedEmail}
            </p>
          ) : null}
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

        {/* 관리자 프로필은 이메일 하나로는 부족하다. 이 프로필로 들어오면 관리자
            화면 진입점이 열리므로 비밀번호를 한 겹 더 둔다 */}
        {selected.isPlexAdmin ? (
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="관리자 비밀번호"
            autoComplete="current-password"
            className="mt-3 w-full rounded-md border border-border bg-secondary/60 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        ) : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <button
          type="submit"
          disabled={
            pending ||
            email.trim().length === 0 ||
            (selected.isPlexAdmin && adminPassword.length === 0)
          }
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          확인
        </button>
      </form>
    )
  }

  return (
    <div className="flex max-w-3xl flex-wrap items-start justify-center gap-x-5 gap-y-7 md:gap-x-7 md:gap-y-8">
      {profiles.map((profile) => (
        <button
          key={profile.id}
          type="button"
          onClick={() => setSelected(profile)}
          className="group flex w-20 flex-col items-center gap-2.5 focus:outline-none md:w-24"
        >
          <Avatar profile={profile} />
          <span className="w-full truncate text-center text-sm text-muted-foreground transition group-hover:text-foreground">
            {profile.name}
          </span>
          {profile.isPlexAdmin ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              관리자
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

/**
 * 아바타가 없는 사람이 있다(서버 접속 이력만 있는 계정). 이름 첫 글자로 대신한다.
 *
 * 인원이 스무 명 가까이 되니 원형으로 작게 잡아 한 화면에 들어오게 한다.
 * 그림자는 바깥으로 깔고 안쪽에 얇은 테두리를 둬서 어두운 배경에서 떠 보이게 한다.
 */
function Avatar({ profile, size = 'md' }: { profile: Profile; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-[4.5rem] w-[4.5rem] text-2xl md:h-20 md:w-20'

  return (
    <span
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-full bg-secondary font-bold text-muted-foreground',
        'shadow-lg shadow-black/50 ring-1 ring-inset ring-white/10 transition duration-200',
        size === 'md' &&
          'group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/60 group-hover:ring-2 group-hover:ring-primary group-focus-visible:ring-2 group-focus-visible:ring-primary',
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
