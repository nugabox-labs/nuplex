'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)

  // 타자를 멈추면 주소를 바꾼다. 결과는 서버에서 렌더된다 — 검색도 DB 한 번이면 끝난다.
  useEffect(() => {
    const trimmed = value.trim()
    if (trimmed === initialQuery) return

    const timer = setTimeout(() => {
      router.replace(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search')
    }, 250)
    return () => clearTimeout(timer)
  }, [value, initialQuery, router])

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/60 px-4 py-3">
      <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="제목 · 출연진으로 검색"
        autoFocus
        className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  )
}
