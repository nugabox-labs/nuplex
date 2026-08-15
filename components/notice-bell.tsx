'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bell, ChevronDown, X } from 'lucide-react'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Notice {
  id: string
  title: string
  body: string
  publishedAt: string
}

// 계정이 없으므로 "어디까지 읽었는지" 는 브라우저에만 남긴다.
// 잃어버려도 안 읽음 배지가 다시 뜰 뿐이라 잃어도 되는 값이다.
const LAST_READ_KEY = 'nuplex:last-read-notice-id'

export function NoticeBell() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  /** 펼쳐 놓은 알림. 목록이 길어지면 제목만 훑고 필요한 것만 여는 편이 낫다 */
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/notices')
    if (!res.ok) return
    const data = (await res.json()) as { notices: Notice[] }
    setNotices(data.notices)
    setExpanded(data.notices[0]?.id ?? null)

    const lastRead = window.localStorage.getItem(LAST_READ_KEY)
    setUnread(
      lastRead
        ? data.notices.filter((n) => Number(n.id) > Number(lastRead)).length
        : data.notices.length,
    )
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function openModal() {
    setOpen(true)
    // 여는 순간 전부 읽은 것으로 본다.
    if (notices[0]) window.localStorage.setItem(LAST_READ_KEY, notices[0].id)
    setUnread(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={unread > 0 ? `알림 ${unread}건` : '알림'}
        className="relative flex items-center justify-center rounded-full border border-border bg-secondary/60 p-2 text-foreground transition hover:bg-secondary hover:text-primary"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="알림"
            className="fixed inset-0 z-[70] flex items-start justify-center bg-background/80 p-4 backdrop-blur-md md:p-10"
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[70vh] max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="flex-1 font-bold text-foreground">알림</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="닫기"
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {notices.length === 0 ? (
                  <p className="px-5 py-16 text-center text-sm text-muted-foreground">
                    아직 도착한 알림이 없습니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {notices.map((notice, index) => {
                      const open = expanded === notice.id
                      return (
                        <li key={notice.id}>
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : notice.id)}
                            aria-expanded={open}
                            className="flex w-full items-baseline gap-3 px-5 py-4 text-left transition hover:bg-secondary/50"
                          >
                            <h3 className="min-w-0 flex-1 font-semibold text-foreground">
                              {/* 맨 위 한 건에만 붙인다. 목록이 길어져도 어디부터 볼지 알 수 있다 */}
                              {index === 0 ? (
                                <span className="mr-2 inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 align-middle text-[11px] font-bold text-primary-foreground">
                                  최신
                                </span>
                              ) : null}
                              {notice.title}
                            </h3>
                            <time className="shrink-0 text-xs text-muted-foreground">
                              {formatRelativeTime(notice.publishedAt)}
                            </time>
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform',
                                open && 'rotate-180',
                              )}
                            />
                          </button>

                          {/* 카카오톡에 보내던 원문 그대로 — 줄바꿈과 이모지를 보존한다 */}
                          {open ? (
                            <p className="whitespace-pre-wrap px-5 pb-4 text-sm leading-relaxed text-foreground/80">
                              {notice.body}
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
