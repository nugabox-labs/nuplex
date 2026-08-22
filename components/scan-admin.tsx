'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Star } from 'lucide-react'
import { SectionTitle } from '@/components/section-title'
import { cn } from '@/lib/utils'

// Plex 라이브러리 파일 스캔. Plex 화면에서 하나씩 누르던 일을 여기서 한다.
// 즐겨찾기로 묶어두면 "즐겨찾기 스캔" 한 번으로 순서대로 다 건다.
//
// 연달아 눌러도 한꺼번에 나가지 않는다. 대기줄에 쌓아 두고 앞의 것이 Plex 에서
// 끝날 때까지 기다린다 — 여러 갈래로 동시에 훑으면 NAS 디스크가 그만큼 느려진다.

interface Section {
  id: number
  title: string
  count: number
}

export function ScanAdmin() {
  const [sections, setSections] = useState<Section[]>([])
  const [favorites, setFavorites] = useState<number[]>([])
  const [scanning, setScanning] = useState<number[]>([])
  // 대기줄. 맨 앞이 지금 시작을 요청 중이거나 Plex 가 훑고 있는 것이다.
  const [queue, setQueue] = useState<number[]>([])
  const [running, setRunning] = useState<number | null>(null)
  // 같은 항목을 두 번 시작하지 않기 위한 표식(개발 모드의 효과 두 번 실행 대비)
  const startedRef = useRef<number | null>(null)
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

  /** 대기줄에 넣기만 한다. 실제 호출은 아래 효과가 하나씩 꺼내서 한다. */
  function enqueue(ids: number[]) {
    if (ids.length === 0) return
    setMessage(null)
    setQueue((list) => [...list, ...ids.filter((id) => !list.includes(id) && id !== running)])
  }

  // 대기줄 처리 — 앞의 것이 끝나야 다음이 나간다.
  // `head` 는 노는 동안의 맨 앞 하나다. 스캔 중에는 undefined 라 효과가 다시 돌지 않는다
  // (대기줄에 더 넣어도 진행 중인 것이 끊기지 않게 하려는 것).
  const head = running === null ? queue[0] : undefined

  useEffect(() => {
    if (head === undefined || startedRef.current === head) return
    startedRef.current = head
    setRunning(head)

    void (async () => {
      const res = await fetch('/api/admin/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIds: [head] }),
      }).catch(() => null)

      setMessage(
        res?.ok
          ? '스캔을 시작했습니다. 진행은 Plex 가 이어서 합니다.'
          : '스캔을 시작하지 못했습니다.',
      )

      // Plex 가 이 라이브러리를 다 훑을 때까지 다음 것을 시작하지 않는다.
      // 스캔이 바로 안 잡힐 수 있어 몇 번은 "아직 시작 전" 으로 보고 기다린다.
      for (let tick = 0; tick < 2400; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const check = await fetch('/api/admin/scan').catch(() => null)
        if (!check?.ok) break
        const data = (await check.json()) as { scanning: number[] }
        setScanning(data.scanning)
        if (data.scanning.includes(head)) continue
        if (tick >= 2) break
      }

      await load()
      startedRef.current = null
      setQueue((list) => list.filter((v) => v !== head))
      setRunning(null)
    })()
  }, [head, load])

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
          onClick={() => enqueue(favoriteSections.map((section) => section.id))}
          disabled={favoriteSections.length === 0}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {queue.length > 1 ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className="h-4 w-4 fill-current" />
          )}
          즐겨찾기 스캔 {favoriteSections.length > 0 ? `(${favoriteSections.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => enqueue(sections.map((section) => section.id))}
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          전체 스캔
        </button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      <p className="text-sm text-muted-foreground">
        별을 눌러 즐겨찾기에 넣어 두면 위 버튼 하나로 순서대로 훑습니다. 여러 개를 연달아
        눌러도 한 번에 하나씩만 돌고 나머지는 <strong className="text-foreground">스캔 대기 중</strong>
        으로 기다립니다. 새 작품은 다음 동기화 때 화면에 올라옵니다.
      </p>

      <ul className="divide-y divide-border/60">
        {sections.map((section) => {
          const busy = running === section.id || scanning.includes(section.id)
          const waiting = queue.includes(section.id) && running !== section.id
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
              ) : waiting ? (
                <span className="text-xs text-muted-foreground">스캔 대기 중</span>
              ) : null}

              <button
                type="button"
                onClick={() => enqueue([section.id])}
                disabled={busy || waiting}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                스캔
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
