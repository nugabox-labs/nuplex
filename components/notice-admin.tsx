'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import { formatRelativeTime } from '@/lib/format'

interface Notice {
  id: string
  title: string
  body: string
  publishedAt: string
}

export function NoticeAdmin() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [days, setDays] = useState(7)
  const [pending, setPending] = useState<null | 'draft' | 'submit'>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/notices')
    if (res.ok) setNotices(((await res.json()) as { notices: Notice[] }).notices)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function makeDraft() {
    setPending('draft')
    setMessage(null)
    const res = await fetch(`/api/admin/notices/draft?days=${days}`)
    if (res.ok) {
      const draft = (await res.json()) as { title: string; body: string }
      setTitle(draft.title)
      setBody(draft.body)
    } else {
      setMessage('초안을 만들지 못했습니다.')
    }
    setPending(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending('submit')
    setMessage(null)

    const res = await fetch('/api/admin/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    })

    if (res.ok) {
      setTitle('')
      setBody('')
      setMessage('알림을 보냈습니다.')
      await load()
    } else {
      setMessage(((await res.json().catch(() => null)) as any)?.error ?? '보내지 못했습니다.')
    }
    setPending(null)
  }

  async function remove(id: string) {
    await fetch(`/api/admin/notices/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-10">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (푸시 알림 제목으로도 쓰입니다)"
            className="min-w-0 flex-1 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            최근
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md border border-border bg-secondary/60 px-2 py-2 text-foreground focus:outline-none"
            >
              {[3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d}일
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={makeDraft}
            disabled={pending !== null}
            className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
          >
            {pending === 'draft' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            초안 만들기
          </button>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          placeholder={'최근 업로드된 작품을 알려드립니다 ☺️\n\n🎥 한국 영화\n- 제목 (2026)'}
          className="w-full resize-y rounded-md border border-border bg-secondary/60 px-4 py-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending !== null || !title.trim() || !body.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {pending === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            알림 보내기
          </button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-bold text-foreground">보낸 알림 {notices.length}건</h2>
        {notices.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {notices.map((notice) => (
              <li key={notice.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-foreground">{notice.title}</h3>
                  <div className="flex shrink-0 items-center gap-3">
                    <time className="text-xs text-muted-foreground">
                      {formatRelativeTime(notice.publishedAt)}
                    </time>
                    <button
                      type="button"
                      onClick={() => remove(notice.id)}
                      aria-label="삭제"
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {notice.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
