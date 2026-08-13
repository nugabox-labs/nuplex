'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { AdminShow } from '@/lib/library'
import { SectionTitle } from './section-title'
import { cn } from '@/lib/utils'

// 시리즈 453편을 한 화면에 늘어놓으면 찾을 수가 없다. 켠 것을 위로 올리고
// 제목 검색을 붙인다 — 관리자가 하는 일은 "이 작품 하나를 찾아 체크" 뿐이다.

export function FeaturedAdmin() {
  const [shows, setShows] = useState<AdminShow[]>([])
  const [keyword, setKeyword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/featured')
    if (!res.ok) return
    const data = (await res.json()) as { shows: AdminShow[] }
    setShows(data.shows)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(show: AdminShow) {
    setBusy(show.ratingKey)
    // 체크는 즉시 보여주고 서버 응답을 기다리지 않는다. 실패하면 아래 load 가 되돌린다.
    setShows((list) =>
      list.map((s) => (s.ratingKey === show.ratingKey ? { ...s, featured: !s.featured } : s)),
    )
    await fetch('/api/admin/featured', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratingKey: show.ratingKey, featured: !show.featured }),
    })
    await load()
    setBusy(null)
  }

  const visible = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return shows
    return shows.filter((show) => show.title.toLowerCase().includes(needle))
  }, [shows, keyword])

  const featuredCount = shows.filter((s) => s.featured).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        체크한 시리즈가 홈 맨 위 <strong className="text-foreground">현재 연재 중인 시리즈</strong>{' '}
        줄에 나옵니다. 전체 {shows.length}편 · 연재 중 {featuredCount}편
      </p>

      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="시리즈 제목으로 찾기"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <ul className="divide-y divide-border/60">
        {visible.map((show) => (
          <li key={show.ratingKey} className="flex items-center gap-3 py-2.5">
            <span className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-xs text-muted-foreground">
              {show.poster ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={show.poster} alt="" className="h-full w-full object-cover" />
              ) : (
                show.title.slice(0, 1)
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">
                {show.title}
                {show.year ? (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {show.year}
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <SectionTitle title={show.sectionTitle} />
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggle(show)}
              disabled={busy === show.ratingKey}
              aria-pressed={show.featured}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition',
                show.featured
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border bg-secondary/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {show.featured ? <Check className="h-4 w-4" /> : null}
              연재 중
            </button>
          </li>
        ))}
      </ul>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">찾는 시리즈가 없습니다.</p>
      ) : null}
    </div>
  )
}
