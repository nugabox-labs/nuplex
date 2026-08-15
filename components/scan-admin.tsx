'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Star } from 'lucide-react'
import { SectionTitle } from '@/components/section-title'
import { cn } from '@/lib/utils'

// Plex 라이브러리 파일 스캔. Plex 화면에서 하나씩 누르던 일을 여기서 한다.
// 즐겨찾기로 묶어두면 "즐겨찾기 스캔" 한 번으로 순서대로 다 건다.

interface Section {
  id: number
  title: string
  count: number
}

export function ScanAdmin() {
  const [sections, setSections] = useState<Section[]>([])
  const [favorites, setFavorites] = useState<number[]>([])
  const [scanning, setScanning] = useState<number[]>([])
  const [pending, setPending] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/scan')
    if (!res.ok) {
      setMessage('라이브러리 목록을 불러오지 못했습니다.')
      setLoading(false)
      return
    }
    const data = (await res.json()) as {
      sections: Section[]
      favorites: number[]
      scanning: number[]
    }
    setSections(data.sections)
    setFavorites(data.favorites)
    setScanning(data.scanning)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 스캔이 도는 동안에는 진행 상황을 계속 확인한다. 끝나면 폴링도 멈춘다.
  useEffect(() => {
    if (scanning.length === 0) return
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [scanning.length, load])

  async function scan(ids: number[]) {
    if (ids.length === 0) return
    setPending(ids)
    setMessage(null)
    const res = await fetch('/api/admin/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionIds: ids }),
    })
    if (res.ok) {
      const { started, failed } = (await res.json()) as { started: number[]; failed: number[] }
      setMessage(
        failed.length > 0
          ? `${started.length}개 시작 · ${failed.length}개 실패`
          : `${started.length}개 스캔을 시작했습니다. 진행은 Plex 가 이어서 합니다.`,
      )
    } else {
      setMessage('스캔을 시작하지 못했습니다.')
    }
    setPending([])
    await load()
  }

  async function toggleFavorite(id: number) {
    const next = favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id]
    setFavorites(next)
    await fetch('/api/admin/scan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites: next }),
    })
  }

  const favoriteSections = sections.filter((section) => favorites.includes(section.id))

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        불러오는 중
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => scan(favoriteSections.map((section) => section.id))}
          disabled={favoriteSections.length === 0 || pending.length > 0}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {pending.length > 1 ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className="h-4 w-4 fill-current" />
          )}
          즐겨찾기 스캔 {favoriteSections.length > 0 ? `(${favoriteSections.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => scan(sections.map((section) => section.id))}
          disabled={pending.length > 0}
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          전체 스캔
        </button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      <p className="text-sm text-muted-foreground">
        별을 눌러 즐겨찾기에 넣어 두면 위 버튼 하나로 순서대로 훑습니다. 스캔은 Plex 가
        뒤에서 진행하고, 새 작품은 다음 동기화 때 화면에 올라옵니다.
      </p>

      <ul className="divide-y divide-border/60">
        {sections.map((section) => {
          const busy = scanning.includes(section.id)
          return (
            <li key={section.id} className="flex items-center gap-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleFavorite(section.id)}
                aria-label={favorites.includes(section.id) ? '즐겨찾기 빼기' : '즐겨찾기'}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition hover:bg-secondary',
                  favorites.includes(section.id) ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Star
                  className={cn('h-4 w-4', favorites.includes(section.id) && 'fill-current')}
                />
              </button>

              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                <SectionTitle title={section.title} />
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {section.count}편
                </span>
              </span>

              {busy ? (
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  스캔 중
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => scan([section.id])}
                disabled={pending.includes(section.id) || busy}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                {pending.includes(section.id) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                스캔
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
