'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCw } from 'lucide-react'
import { formatElapsed, formatRelativeTime, formatShortDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// 수동 동기화. 스캔과는 다른 일이다 — 스캔은 Plex 가 파일을 다시 훑는 것이고,
// 동기화는 그렇게 채워진 Plex 를 누플렉스가 읽어 오는 것이다.
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
  runs: Run[]
  pending: { kind: string; requestedAt: string } | null
}

function kindLabel(kind: string): string {
  return kind === 'full' ? '전체' : '증분'
}

function statusLabel(status: string): string {
  if (status === 'running') return '동기화 중'
  return status === 'failed' ? '실패' : '완료'
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

  const runs = state?.runs ?? []
  const current = runs.find((run) => run.status === 'running') ?? null

  // 요청을 남겼거나 돌고 있는 동안만 들여다본다. 노는 중에는 폴링도 쉰다.
  const busy = Boolean(current || state?.pending)
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

  return (
    <section className="space-y-4 border-t border-border/60 pt-8">
      <h2 className="text-lg font-bold text-foreground">동기화</h2>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={locked}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
          지금 동기화
        </button>
        <p className="text-sm text-muted-foreground">
          {current
            ? `동기화 중 · ${kindLabel(current.kind)} · ${formatRelativeTime(current.startedAt)} 시작`
            : state?.pending
              ? '요청을 남겼습니다. 워커가 곧 집어 갑니다.'
              : (message ?? '')}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold text-foreground">동기화 이력</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 동기화된 적이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {runs.map((run) => (
              <li key={run.startedAt} className="flex items-center gap-3 py-2">
                <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatShortDateTime(run.startedAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {kindLabel(run.kind)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {run.error
                      ? run.error
                      : `작품 ${run.itemsUpserted}건 · 에피소드 ${run.episodesUpserted}건`}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                    run.status === 'running' && 'text-primary',
                  )}
                >
                  {statusLabel(run.status)}
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {run.finishedAt
                    ? formatElapsed(
                        new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime(),
                      )
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
