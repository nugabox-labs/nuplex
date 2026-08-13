'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, RotateCcw } from 'lucide-react'
import { SectionTitle } from './section-title'

// 홈의 라이브러리 줄 순서. 기본 차례는 서버가 정하고(lib/library.ts 의 HOME_SECTION_ORDER),
// 보는 사람이 바꾸면 그 브라우저에만 남는다 — 순서 하나 때문에 DB 에 표를 늘리지
// 않는다(AGENTS §2). 대신 기기를 바꾸면 기본 순서로 돌아간다.
//
// "이어서 보기" · "최근 추가" · "시리즈 모음" 은 여기 오지 않는다. 자리를 고정한다.

const STORAGE_KEY = 'nuplex:home-row-order'

export interface HomeRow {
  key: string
  title: string
  node: React.ReactNode
}

export function HomeRows({ rows }: { rows: HomeRow[] }) {
  /** null 이면 서버가 준 기본 차례 그대로 */
  const [order, setOrder] = useState<string[] | null>(null)
  const [editing, setEditing] = useState(false)

  // 저장값은 첫 그리기 뒤에 읽는다. 서버와 다른 순서로 그리면 hydration 이 어긋난다.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setOrder(JSON.parse(saved) as string[])
    } catch {
      // 저장값이 깨졌으면 기본 순서로 둔다
    }
  }, [])

  const ordered = useMemo(() => {
    if (!order) return rows
    const rank = new Map(order.map((key, index) => [key, index]))
    // 저장된 뒤에 새로 생긴 줄은 뒤로 보낸다. 사라지지는 않는다.
    return rows
      .map((row, index) => ({ row, rank: rank.get(row.key) ?? order.length + index }))
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.row)
  }, [rows, order])

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const next = ordered.map((row) => row.key)
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function reset() {
    setOrder(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <>
      <div className="flex items-center justify-end px-4 md:px-8">
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          aria-expanded={editing}
          className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
          {editing ? '완료' : '줄 순서'}
        </button>
      </div>

      {editing ? (
        <div className="mx-4 rounded-lg border border-border bg-card p-2 md:mx-8">
          <ul className="divide-y divide-border/60">
            {ordered.map((row, index) => (
              <li key={row.key} className="flex items-center gap-2 py-1.5 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  <SectionTitle title={row.title} />
                </span>
                <MoveButton
                  label="위로"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </MoveButton>
                <MoveButton
                  label="아래로"
                  disabled={index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </MoveButton>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 px-3 pt-2">
            <p className="text-xs text-muted-foreground">이 기기에만 저장됩니다</p>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              기본 순서로
            </button>
          </div>
        </div>
      ) : null}

      {ordered.map((row) => (
        <div key={row.key}>{row.node}</div>
      ))}
    </>
  )
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
