'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import type { AdminProfile } from '@/lib/profiles'
import { cn } from '@/lib/utils'

// Plex 에서 긁어온 사람들을 여기서 켜고 끈다. 켠 사람만 프로필 선택 화면에 나온다.
// 이메일이 없는 사람은 첫 진입 확인을 통과할 방법이 없어서 켤 수 없다 — 먼저 채워야 한다.

const SOURCE_LABEL: Record<string, string> = {
  home: 'Home',
  friend: '친구',
  server: '접속이력',
}

export function ProfileAdmin() {
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<number, { name: string; email: string }>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/profiles')
    if (!res.ok) return
    const data = (await res.json()) as { profiles: AdminProfile[] }
    setProfiles(data.profiles)
    setDrafts(
      Object.fromEntries(
        data.profiles.map((p) => [p.id, { name: p.displayName ?? '', email: p.emailOverride ?? '' }]),
      ),
    )
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id)
    setMessage(null)
    const res = await fetch(`/api/admin/profiles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setMessage(((await res.json().catch(() => null)) as any)?.error ?? '저장하지 못했습니다.')
    } else {
      await load()
    }
    setBusy(null)
  }

  const enabledCount = profiles.filter((p) => p.enabled).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          전체 {profiles.length}명 · 켜짐 {enabledCount}명
        </p>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
      </div>

      <ul className="divide-y divide-border/60">
        {profiles.map((profile) => {
          const draft = drafts[profile.id] ?? { name: '', email: '' }
          const dirty =
            draft.name !== (profile.displayName ?? '') ||
            draft.email !== (profile.emailOverride ?? '')

          return (
            <li key={profile.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-sm font-bold text-muted-foreground">
                {profile.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  profile.name.slice(0, 1)
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold text-foreground">
                  {profile.name}
                  {profile.isAdmin ? (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      관리자
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile.email ?? '이메일 없음'}
                  {profile.sources.length > 0
                    ? ` · ${profile.sources.map((s) => SOURCE_LABEL[s] ?? s).join(' · ')}`
                    : ''}
                </p>
              </div>

              <input
                value={draft.name}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [profile.id]: { ...draft, name: e.target.value } }))
                }
                placeholder={profile.plexName ?? '표시 이름'}
                className="w-32 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <input
                value={draft.email}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [profile.id]: { ...draft, email: e.target.value } }))
                }
                placeholder="이메일 보정"
                className="w-48 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />

              {dirty ? (
                <button
                  type="button"
                  onClick={() =>
                    patch(profile.id, { displayName: draft.name, emailOverride: draft.email })
                  }
                  disabled={busy === profile.id}
                  className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
                >
                  저장
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => patch(profile.id, { enabled: !profile.enabled })}
                disabled={busy === profile.id}
                aria-pressed={profile.enabled}
                className={cn(
                  'flex w-24 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition',
                  profile.enabled
                    ? 'bg-primary text-primary-foreground hover:brightness-110'
                    : 'border border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {busy === profile.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : profile.enabled ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                {profile.enabled ? '켜짐' : '꺼짐'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
