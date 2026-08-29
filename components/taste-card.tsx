'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'

// "내 취향" 맨 위 카드. 무엇을 좋아하는 사람인지 한 문단으로 말해준다.
// 골라준 작품은 여기가 아니라 홈의 "○○님이 볼 만한 작품" 줄에 나온다.
//
// 딥시크 응답이 30초~1분이라 서버에서 기다릴 수 없다. 화면은 담아둔 것이 있으면 그대로
// 즉시 그리고, 없을 때만 뜬 뒤에 /api/space/taste 를 불러 채운다.

export interface TasteView {
  summary: string
  tags: string[]
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

  const load = useCallback(async () => {
    setBusy(true)
    setFailed(null)
    try {
      const res = await fetch('/api/space/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
    if (!initial) void load()
  }, [initial, load])

  // 키가 없거나 아직 본 것이 없으면 카드를 접는다. 빈 상자를 남겨두지 않는다.
  if (!taste && (failed?.state === 'no-key' || failed?.state === 'not-enough')) return null

  if (!taste) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
          {busy
            ? '시청 기록을 읽고 있습니다. 30초에서 1분쯤 걸립니다.'
            : (failed?.state === 'unavailable' && failed.message) || '취향을 정리하지 못했습니다.'}
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="text-base leading-relaxed text-foreground md:text-lg">{taste.summary}</p>

      {taste.tags.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {taste.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary md:text-base"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </Shell>
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
