'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCw } from 'lucide-react'
import { formatElapsed, formatRelativeTime } from '@/lib/format'

// 수동 동기화. 스캔 화면 맨 위에 둔다 — 관리자가 헷갈리는 자리가 여기라서다.
//
// 스캔과 동기화는 다른 일이다. 스캔은 Plex 가 파일을 다시 훑는 것이고, 동기화는 그렇게
// 채워진 Plex 를 누플렉스가 읽어 오는 것이다. 새 작품은 두 가지를 다 거쳐야 화면에 뜬다.
//
// 버튼은 Plex 를 부르지 않는다. DB 에 요청을 적어 두면 sync 워커가 10초 안에 집어 간다
// (AGENTS §2 — Plex 호출은 워커만 한다).

interface Run {
  kind: string
  status: string
  startedAt: string
  finishedAt: string | null
  itemsUpserted: number
  episodesUpserted: number
  itemsDeleted: number
  error: string | null
}

interface State {
  current: Run | null
  last: Run | null
  pending: { kind: string; requestedAt: string } | null
}

function kindLabel(kind: string): string {
  return kind === 'full' ? '전체' : '증분'
}

export function SyncAdmin() {
  const [state, setState] = useState<State | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/sync').catch(() => null)
    if (!res?.ok) return
    setState((await res.json()) as State)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 요청을 남겼거나 돌고 있는 동안만 들여다본다. 노는 중에는 폴링도 쉰다.
  const busy = Boolean(state?.current || state?.pending)
  // 잠그는 건 "아직 안 집어 간 요청" 이 있을 때뿐이다. 진행 중이라고 잠그면,
  // 워커가 죽어 running 행이 남았을 때 버튼을 영영 못 누른다 — 하필 그때 제일 필요하다.
  // 도는 중에 눌러도 손해는 없다. 워커가 지금 것을 끝내고 이어서 한 번 더 돈다.
  const locked = Boolean(state?.pending)
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [busy, load])

  async function start() {
    setMessage(null)
    const res = await fetch('/api/admin/sync', { method: 'POST' }).catch(() => null)
    setMessage(
      res?.ok
        ? '동기화를 요청했습니다. 워커가 10초 안에 시작합니다.'
        : '동기화를 요청하지 못했습니다.',
    )
    await load()
  }

  const last = state?.last ?? null
  const elapsed =
    last?.finishedAt
      ? formatElapsed(new Date(last.finishedAt).getTime() - new Date(last.startedAt).getTime())
      : null

  return (
    <section className="mb-8 rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={locked}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
          지금 동기화
        </button>
        <p className="text-sm text-muted-foreground">
          {state?.current
            ? `동기화 중 · ${kindLabel(state.current.kind)} · ${formatRelativeTime(state.current.startedAt)} 시작`
            : state?.pending
              ? '요청을 남겼습니다. 워커가 곧 집어 갑니다.'
              : (message ?? '')}
        </p>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        <strong className="text-foreground">스캔과 동기화는 다릅니다.</strong> 스캔은 Plex 가
        디스크의 파일을 다시 훑는 일이고, 동기화는 그렇게 채워진 Plex 를 누플렉스가 읽어 와
        화면에 올리는 일입니다. 새 작품은 <strong className="text-foreground">스캔 → 동기화</strong>
        {' '}순서를 거쳐야 보입니다. 동기화는 30분마다 · 전체 훑기는 매일 04:05 에 저절로 돌고,
        위 버튼은 그걸 기다리지 않고 지금 한 번 돌립니다.
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        {last
          ? `마지막 동기화 · ${kindLabel(last.kind)} · ${
              last.status === 'ok' ? '성공' : '실패'
            } · ${formatRelativeTime(last.finishedAt ?? last.startedAt)}${
              elapsed ? ` · ${elapsed} 걸림` : ''
            } · 작품 ${last.itemsUpserted}건 · 에피소드 ${last.episodesUpserted}건`
          : '아직 동기화된 적이 없습니다.'}
        {last?.error ? (
          <span className="ml-1 text-destructive">— {last.error}</span>
        ) : null}
      </p>
    </section>
  )
}
