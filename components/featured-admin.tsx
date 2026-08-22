'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { AdminShow } from '@/lib/library'
import { metaLine } from '@/lib/format'
import { SectionTitle } from './section-title'
import { cn } from '@/lib/utils'

// 시리즈 453편을 한 화면에 늘어놓으면 찾을 수가 없다. 켠 것을 위로 올리고
// 제목 검색을 붙인다 — 관리자가 하는 일은 "이 작품 하나를 찾아 체크" 뿐이다.
//
// 시즌이 여럿인 작품은 눌러서 펼치면 시즌마다 따로 켤 수 있다. 시즌만 켜면 홈에는
// 작품명과 시즌명이 함께 나온다(시즌명이 "시즌 1" 뿐일 수 있어 작품명이 필요하다).

export function FeaturedAdmin() {
  const [shows, setShows] = useState<AdminShow[]>([])
  const [keyword, setKeyword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/featured')
    if (!res.ok) return
    const data = (await res.json()) as { shows: AdminShow[] }
    setShows(data.shows)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 작품 · 시즌의 연재 표시를 켜고 끈다. 체크는 즉시 보여주고 서버 응답을 기다리지 않는다 */
  async function toggle(ratingKey: string, featured: boolean, kind: 'show' | 'season') {
    setBusy(ratingKey)
    setShows((list) =>
      list.map((show) =>
        kind === 'show'
          ? show.ratingKey === ratingKey
            ? { ...show, featured: !featured }
            : show
          : {
              ...show,
              seasons: show.seasons.map((season) =>
                season.ratingKey === ratingKey ? { ...season, featured: !featured } : season,
              ),
            },
      ),
    )
    // 실패하면 아래 load 가 되돌린다.
    await fetch('/api/admin/featured', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratingKey, featured: !featured, kind }),
    })
    await load()
    setBusy(null)
  }

  const visible = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return shows
    return shows.filter((show) => show.title.toLowerCase().includes(needle))
  }, [shows, keyword])

  const featuredCount =
    shows.filter((s) => s.featured).length +
    shows.reduce((sum, show) => sum + show.seasons.filter((season) => season.featured).length, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        켠 작품이 홈 맨 위 <strong className="text-foreground">현재 연재 중인 시리즈</strong> 줄에
        나옵니다. 시즌이 여럿이면 작품을 눌러 펼친 뒤 시즌만 켤 수도 있습니다 — 그러면 홈에
        작품명과 시즌명이 함께 나옵니다. 전체 {shows.length}편 · 연재 중 {featuredCount}편
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
        {visible.map((show) => {
          const open = expanded === show.ratingKey
          const hasSeasons = show.seasons.length > 1

          return (
            <li key={show.ratingKey} className="py-2.5">
              <div className="flex items-center gap-3">
                {/* 시즌이 둘 이상일 때만 펼칠 것이 있다 */}
                <button
                  type="button"
                  onClick={() => hasSeasons && setExpanded(open ? null : show.ratingKey)}
                  disabled={!hasSeasons}
                  aria-expanded={hasSeasons ? open : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  <span className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-xs text-muted-foreground">
                    {show.poster ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={show.poster} alt="" className="h-full w-full object-cover" />
                    ) : (
                      show.title.slice(0, 1)
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-foreground">
                        {show.title}
                        {show.year ? (
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            {show.year}
                          </span>
                        ) : null}
                      </span>
                      {hasSeasons ? (
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition',
                            open && 'rotate-180',
                          )}
                        />
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <SectionTitle title={show.sectionTitle} />
                      {hasSeasons ? ` · 총 ${show.seasons.length}개 시즌` : ''}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => toggle(show.ratingKey, show.featured, 'show')}
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
                  {show.featured ? '연재 중' : '연재'}
                </button>
              </div>

              {open ? (
                <ul className="mt-2 space-y-1 border-l-2 border-border/60 pl-4">
                  {show.seasons.map((season) => (
                    <li key={season.ratingKey} className="flex items-center gap-3 py-1.5">
                      <span className="flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-xs text-muted-foreground">
                        {season.poster ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={season.poster} alt="" className="h-full w-full object-cover" />
                        ) : (
                          season.title.slice(0, 1)
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {season.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {metaLine(season.year)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggle(season.ratingKey, season.featured, 'season')}
                        disabled={busy === season.ratingKey}
                        aria-pressed={season.featured}
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition',
                          season.featured
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-border bg-secondary/60 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {season.featured ? <Check className="h-3.5 w-3.5" /> : null}
                        {season.featured ? '연재 중' : '연재'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">찾는 시리즈가 없습니다.</p>
      ) : null}
    </div>
  )
}
