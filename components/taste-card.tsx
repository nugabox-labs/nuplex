'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import type { LibraryItem } from '@/lib/library'
import { MovieCard } from './movie-card'

// "내 공간" 맨 위 카드. 무엇을 자주 보는 사람인지 한 문단으로 정리하고,
// 라이브러리 안에서 볼 만한 것을 골라준다.
//
// 딥시크 응답이 30초~1분이라 서버에서 기다릴 수 없다. 화면은 담아둔 것이 있으면 그대로
// 즉시 그리고, 없을 때만 뜬 뒤에 /api/space/taste 를 불러 채운다.

export interface TasteView {
  summary: string
  tags: string[]
  picks: { item: LibraryItem; reason: string }[]
  model: string
  /** ISO 문자열. 서버에서 넘어올 때 한 번 문자열로 만든다 */
  createdAt: string
}

type Result =
  | { state: 'ok'; taste: TasteView }
  | { state: 'not-enough' }
  | { state: 'no-key' }
  | { state: 'unavailable'; message?: string }

export function TasteCard({ initial }: { initial: TasteView | null }) {
  const [taste, setTaste] = useState<TasteView | null>(initial)
  // 담아둔 것이 있으면 부를 필요가 없다. 없을 때만 처음부터 도는 상태로 시작한다.
  const [busy, setBusy] = useState(!initial)
  const [failed, setFailed] = useState<Result | null>(null)

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true)
    setFailed(null)
    try {
      const res = await fetch('/api/space/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      const data = (await res.json()) as Result
      if (data.state === 'ok') setTaste(data.taste)
      else setFailed(data)
    } catch {
      setFailed({ state: 'unavailable', message: '분석 요청이 끊겼습니다.' })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!initial) void load(false)
  }, [initial, load])

  // 키가 없거나 아직 볼 만큼 안 봤으면 카드를 접는다. 빈 상자를 남겨두지 않는다.
  if (!taste && failed?.state === 'no-key') return null
  if (!taste && failed?.state === 'not-enough') {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          조금 더 보시면 무엇을 좋아하는지 정리해 드립니다.
        </p>
      </Shell>
    )
  }

  if (!taste) {
    return (
      <Shell>
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            시청 기록을 읽고 있습니다. 30초에서 1분쯤 걸립니다.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {failed?.state === 'unavailable' && failed.message
                ? failed.message
                : '취향을 정리하지 못했습니다.'}
            </p>
            <RetryButton busy={busy} onClick={() => void load(true)} label="다시 시도" />
          </div>
        )}
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="text-sm leading-relaxed text-foreground md:text-base">{taste.summary}</p>

      {taste.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {taste.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      {taste.picks.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            이 안에서 골라봤습니다
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              지금 NUPLEX 에 있는 작품입니다
            </span>
          </h3>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
            {taste.picks.map((pick) => (
              <div key={pick.item.ratingKey} className="w-40 shrink-0 sm:w-44 md:w-48">
                <MovieCard item={pick.item} />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pick.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {new Date(taste.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 기준 ·{' '}
          {taste.model}
        </span>
        <RetryButton busy={busy} onClick={() => void load(true)} label="다시 분석" />
      </div>
    </Shell>
  )
}

function RetryButton({
  busy,
  onClick,
  label,
}: {
  busy: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={busy ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
      {busy ? '분석 중' : label}
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-5 md:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
        <Sparkles className="h-4 w-4" />
        AI 취향 요약
      </h2>
      {children}
    </section>
  )
}
