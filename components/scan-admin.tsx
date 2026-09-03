'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, RotateCw, Star } from 'lucide-react'
import { SectionTitle } from '@/components/section-title'
import { formatElapsed, formatRelativeTime, formatShortDateTime } from '@/lib/format'
import type { ScanRun } from '@/lib/scan'
import { cn } from '@/lib/utils'

// 스캔과 동기화. 둘은 다른 일이지만 하나의 흐름이라 한 화면에 둔다 —
// Plex 가 파일을 훑고(스캔), 그렇게 채워진 Plex 를 누플렉스가 읽어 온다(동기화).
//
// 어느 버튼도 Plex 를 부르지 않는다. 스캔은 대기줄에, 동기화는 쪽지에 남기고
// sync 워커가 10초 안에 집어 간다(AGENTS §2 — Plex 호출은 워커만 한다).
//
// **대기가 없어질 때까지가 하나의 일련 작업이다.** 여러 개를 걸어도 한 번에 하나씩
// 순서대로 훑고, 마지막 하나가 끝나면 워커가 이어서 동기화를 한 번 돌린다.

interface Section {
  id: number
  title: string
  count: number
}

interface ScanState {
  sections: Section[]
  favorites: number[]
  current: number | null
  queue: number[]
  history: ScanRun[]
}

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

interface SyncState {
  runs: Run[]
  pending: { kind: string; requestedAt: string } | null
}

export function ScanAdmin() {
  const [scan, setScan] = useState<ScanState | null>(null)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [scanRes, syncRes] = await Promise.all([
      fetch('/api/admin/scan').catch(() => null),
      fetch('/api/admin/sync').catch(() => null),
    ])
    if (scanRes?.ok) setScan((await scanRes.json()) as ScanState)
    else setMessage('라이브러리 목록을 불러오지 못했습니다.')
    if (syncRes?.ok) setSync((await syncRes.json()) as SyncState)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sections = scan?.sections ?? []
  const favorites = scan?.favorites ?? []
  const queue = scan?.queue ?? []
  const current = scan?.current ?? null
  const runs = sync?.runs ?? []
  const running = runs.find((run) => run.status === 'running') ?? null

  // 스캔이 남았거나 동기화가 걸려 있는 동안만 들여다본다. 노는 중에는 폴링도 쉰다.
  const busy = Boolean(current !== null || queue.length > 0 || running || sync?.pending)

  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [busy, load])

  async function enqueue(ids: number[]) {
    if (ids.length === 0) return
    setMessage(null)
    const res = await fetch('/api/admin/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionIds: ids }),
    }).catch(() => null)
    setMessage(
      res?.ok
        ? '스캔을 걸었습니다. 순서대로 하나씩 훑고, 다 끝나면 동기화까지 이어집니다.'
        : '스캔을 걸지 못했습니다.',
    )
    await load()
  }

  async function startSync() {
    setMessage(null)
    const res = await fetch('/api/admin/sync', { method: 'POST' }).catch(() => null)
    setMessage(
      res?.ok
        ? '동기화를 요청했습니다. 워커가 10초 안에 시작합니다.'
        : '동기화를 요청하지 못했습니다.',
    )
    await load()
  }

  async function toggleFavorite(id: number) {
    const next = favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id]
    setScan((prev) => (prev ? { ...prev, favorites: next } : prev))
    await fetch('/api/admin/scan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites: next }),
    })
  }

  if (!scan) {
    return (
      <p className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        불러오는 중
      </p>
    )
  }

  const favoriteSections = sections.filter((section) => favorites.includes(section.id))
  const scanBusy = current !== null || queue.length > 0
  // 잠그는 건 "아직 안 집어 간 요청" 이 있을 때뿐이다. 진행 중이라고 잠그면,
  // 워커가 죽어 running 행이 남았을 때 버튼을 영영 못 누른다 — 하필 그때 제일 필요하다.
  const syncLocked = Boolean(sync?.pending)

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">스캔 및 동기화</h2>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void enqueue(favoriteSections.map((section) => section.id))}
            disabled={favoriteSections.length === 0}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {scanBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Star className="h-4 w-4 fill-current" />
            )}
            즐겨찾기 스캔 {favoriteSections.length > 0 ? `(${favoriteSections.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => void enqueue(sections.map((section) => section.id))}
            className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            전체 스캔
          </button>
          <button
            type="button"
            onClick={() => void startSync()}
            disabled={syncLocked}
            className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
            지금 동기화
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          {statusLine(scanBusy, running, sync?.pending ?? null) ?? message ?? ''}
        </p>

        <p className="text-sm text-muted-foreground">
          별을 눌러 즐겨찾기에 넣어 두면 위 버튼 하나로 순서대로 훑습니다. 여러 개를 연달아
          눌러도 한 번에 하나씩만 돌고 나머지는{' '}
          <strong className="text-foreground">스캔 대기 중</strong> 으로 기다립니다.{' '}
          <strong className="text-foreground">대기가 다 없어지면 동기화가 이어서 한 번 돕니다</strong>
          — 새 작품은 그때 화면에 올라옵니다. 스캔과 동기화는 서로 겹치지 않고 차례를 기다립니다.
        </p>

        <ul className="divide-y divide-border/60 pb-2">
          {sections.map((section) => {
            const isCurrent = current === section.id
            const waiting = queue.includes(section.id)
            return (
              <li key={section.id} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void toggleFavorite(section.id)}
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

                {isCurrent ? (
                  <span className="flex items-center gap-1.5 text-xs text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    스캔 중
                  </span>
                ) : waiting ? (
                  <span className="text-xs text-muted-foreground">스캔 대기 중</span>
                ) : null}

                <button
                  type="button"
                  onClick={() => void enqueue([section.id])}
                  disabled={isCurrent || waiting}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  스캔
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-8 border-t border-border/60 pt-8">
        <h3 className="mb-3 text-sm font-bold text-foreground">스캔 이력</h3>
        {scan.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 스캔한 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {scan.history.map((run) => (
              <li key={`${run.startedAt}:${run.sectionId}`} className="flex items-center gap-3 py-2">
                <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatShortDateTime(run.startedAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  <SectionTitle title={run.title} />
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                    run.status === 'running' && 'text-primary',
                  )}
                >
                  {scanStatusLabel(run.status)}
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {elapsedOf(run.startedAt, run.finishedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          최근 10건만 남깁니다. 걸린 시간은 Plex 가 이 라이브러리를 훑고 있다고 답하는 동안을
          잰 것이라 몇 초 안팎의 오차가 있습니다.
        </p>
      </section>

      <section className="mt-8 border-t border-border/60 pt-8">
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
                  {syncKindLabel(run)}
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
                  {syncStatusLabel(run.status)}
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {elapsedOf(run.startedAt, run.finishedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** 지금 무슨 일이 벌어지고 있는지 한 줄. 아무 일도 없으면 null 이라 버튼 메시지가 대신 나온다. */
function statusLine(
  scanBusy: boolean,
  running: Run | null,
  pending: SyncState['pending'],
): string | null {
  if (scanBusy) return '스캔 중 · 대기가 다 없어지면 동기화가 이어서 돕니다'
  if (running) {
    return `동기화 중 · ${syncKindLabel(running)} · ${formatRelativeTime(running.startedAt)} 시작`
  }
  if (pending) return '동기화 요청을 남겼습니다. 워커가 곧 집어 갑니다.'
  return null
}

function syncKindLabel(run: Run): string {
  return run.kind === 'full' ? '전체' : '증분'
}

function syncStatusLabel(status: string): string {
  if (status === 'running') return '동기화 중'
  return status === 'failed' ? '실패' : '완료'
}

function scanStatusLabel(status: ScanRun['status']): string {
  if (status === 'running') return '스캔 중'
  return status === 'failed' ? '실패' : '완료'
}

function elapsedOf(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return ''
  return formatElapsed(new Date(finishedAt).getTime() - new Date(startedAt).getTime())
}
