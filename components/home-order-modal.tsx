'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionTitle } from './section-title'

// 홈에 라이브러리 줄이 나오는 차례를 바꾸는 창. 프로필 메뉴에서 연다.
//
// 저장은 프로필에 한다(profile.home_row_order) — 폰에서 바꾼 차례가 데스크탑에서도
// 그대로다. 브라우저에 두면 기기를 옮길 때마다 다시 맞춰야 한다.
// 홈은 서버에서 순서를 맞춰 그리므로, 저장한 뒤 router.refresh() 로 다시 받아온다.

export interface OrderableRow {
  key: string
  title: string
}

/** 저장된 차례를 실제 줄 목록에 입힌다. 목록에 없는 줄은 원래 자리 뒤에 붙는다. */
function applyOrder(rows: OrderableRow[], order: string[] | null): OrderableRow[] {
  if (!order) return rows
  const rank = new Map(order.map((key, index) => [key, index]))
  return rows
    .map((row, index) => ({ row, rank: rank.get(row.key) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.row)
}

export function HomeOrderModal({
  rows,
  open,
  onClose,
}: {
  rows: OrderableRow[]
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  /** null 이면 서버가 정한 기본 차례 그대로 */
  const [order, setOrder] = useState<string[] | null>(null)
  /** 숨긴 줄. 라이브러리 줄만 숨길 수 있다 */
  const [hidden, setHidden] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 열 때마다 서버에서 다시 읽는다. 다른 기기에서 바꿨을 수 있다.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch('/api/profile/home-order')
      .then((res) => (res.ok ? res.json() : { order: null, hidden: [] }))
      .then((data) => {
        setOrder((data.order as string[] | null) ?? null)
        setHidden((data.hidden as string[] | undefined) ?? [])
      })
      .catch(() => setError('저장된 순서를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const ordered = useMemo(() => applyOrder(rows, order), [rows, order])

  async function save(nextOrder: string[], nextHidden: string[]) {
    setError(null)
    const res = await fetch('/api/profile/home-order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: nextOrder, hidden: nextHidden }),
    })
    if (!res.ok) {
      setError('저장하지 못했습니다.')
      return
    }
    // 홈은 서버에서 그려진다. 새로 받아와야 바뀐 차례가 보인다.
    router.refresh()
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const next = ordered.map((row) => row.key)
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    void save(next, hidden)
  }

  function toggleHidden(key: string) {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    setHidden(next)
    void save(ordered.map((row) => row.key), next)
  }

  function reset() {
    setOrder(null)
    setHidden([])
    void save([], [])
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="홈 화면 설정"
          className="fixed inset-0 z-[70] flex items-start justify-center bg-background/80 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-md md:p-10 md:pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-[calc(env(safe-area-inset-bottom)+2.5rem)]"
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
            className="flex h-[70vh] max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              <h2 className="flex-1 font-bold text-foreground">홈 화면 설정</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted-foreground">
                홈에 줄이 나오는 차례입니다. "이어서 보기" 만 맨 위에 고정이고, 나머지는
                순서를 바꿀 수 있습니다. 라이브러리 줄은 눈 아이콘으로 숨길 수 있습니다.
              </p>
              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border/60">
                  {ordered.map((row, index) => (
                    <li key={row.key} className="flex items-center gap-2 py-1.5">
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm font-medium',
                          hidden.includes(row.key)
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground',
                        )}
                      >
                        <SectionTitle title={row.title} />
                      </span>
                      {/* 숨기기는 라이브러리 줄에만 준다. 최근 추가 · 연재 중 · 시리즈
                          모음은 순서만 바꾼다 */}
                      {row.key.startsWith('section-') ? (
                        <MoveButton
                          label={hidden.includes(row.key) ? '다시 보이기' : '숨기기'}
                          disabled={false}
                          onClick={() => toggleHidden(row.key)}
                        >
                          {hidden.includes(row.key) ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </MoveButton>
                      ) : null}
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
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">프로필에 저장되어 어느 기기에서나 같습니다</p>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                기본 순서로
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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
