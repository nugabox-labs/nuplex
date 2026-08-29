'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import type { LibraryItem } from '@/lib/library'
import { cn } from '@/lib/utils'
import { MovieCard } from './movie-card'

// "내가 본 작품" — 장르로 걸러 보고, 편집 모드에서 몇 개를 골라 감춘다.
//
// 감추는 것은 시청 기록을 지우는 것이 아니다. watch_history 는 Plex 사본이라 지워도
// 다음 동기화가 되살린다(database/0014_hidden_watched.sql). 목록에서 안 보이게만 한다.

const ALL = '전체'

export function WatchedList({ items: initialItems }: { items: LibraryItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [genre, setGenre] = useState(ALL)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // 장르 탭은 실제로 본 작품에서만 뽑는다. 작품이 많은 장르가 앞에 온다.
  const genres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      for (const name of item.genres) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
  }, [items])

  const visible = useMemo(
    () => (genre === ALL ? items : items.filter((item) => item.genres.includes(genre))),
    [items, genre],
  )

  function toggle(ratingKey: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(ratingKey)) next.delete(ratingKey)
      else next.add(ratingKey)
      return next
    })
  }

  function cancel() {
    setEditing(false)
    setSelected(new Set())
  }

  async function hideSelected() {
    if (selected.size === 0) return
    if (!window.confirm(`${selected.size}개의 항목을 숨깁니다. 계속하시겠습니까?`)) return

    const ratingKeys = [...selected]
    setBusy(true)
    const res = await fetch('/api/space/hidden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratingKeys }),
    })
    setBusy(false)
    if (!res.ok) {
      window.alert('숨기지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      return
    }

    setItems((current) => current.filter((item) => !selected.has(item.ratingKey)))
    cancel()
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-lg font-bold text-foreground md:text-xl">
          내가 본 작품
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {visible.length.toLocaleString('ko-KR')}편
          </span>
        </h2>

        {editing ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void hideSelected()}
              disabled={selected.size === 0 || busy}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              선택 항목 제거
              {selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-40"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            편집
          </button>
        )}
      </div>

      {/* 장르 탭. 좁은 화면에서는 옆으로 넘긴다 — 다 펼치면 줄이 화면 몇 배가 된다 */}
      <div className="no-scrollbar mb-6 flex items-center gap-1.5 overflow-x-auto pb-1">
        <GenreTab label={ALL} count={items.length} active={genre === ALL} onClick={() => setGenre(ALL)} />
        {genres.map(([name, count]) => (
          <GenreTab
            key={name}
            label={name}
            count={count}
            active={genre === name}
            onClick={() => setGenre(name)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-5 md:gap-x-6 md:gap-y-8">
        {visible.map((item) => (
          <div key={item.ratingKey} className="relative">
            <MovieCard item={item} />

            {/* 편집 중에는 카드 전체가 고르는 자리가 된다. 이 막이 없으면 작품 상세로
                넘어가 버려서 고를 수가 없다 */}
            {editing ? (
              <button
                type="button"
                onClick={() => toggle(item.ratingKey)}
                aria-pressed={selected.has(item.ratingKey)}
                aria-label={`${item.title} 고르기`}
                className="absolute inset-0 z-10 rounded-lg ring-primary transition focus:outline-none focus-visible:ring-2"
              >
                <span
                  className={cn(
                    'absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 transition',
                    selected.has(item.ratingKey)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-white/70 bg-background/60 backdrop-blur-sm',
                  )}
                >
                  {selected.has(item.ratingKey) ? <Check className="h-4 w-4" /> : null}
                </span>
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          이 장르로 본 작품이 없습니다.
        </p>
      ) : null}
    </section>
  )
}

function GenreTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition',
        active
          ? 'border-primary bg-primary/15 font-medium text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span className="text-xs opacity-60">{count}</span>
    </button>
  )
}
