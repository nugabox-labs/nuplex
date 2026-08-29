'use client'

import { useEffect, useState } from 'react'
import type { LibraryItem } from '@/lib/library'
import { ContentRow } from './content-row'

// 홈의 "○○님이 볼 만한 작품" 줄. 고르는 일은 "내 취향" 과 같은 자리에서 한다.
//
// 담아둔 것이 있으면 서버가 그대로 내려주고 이 컴포넌트는 그리기만 한다. 없으면
// 화면이 뜬 뒤 조용히 만들어 온다 — 홈이 30초~1분을 기다릴 수는 없기 때문이다.
// 만들어지기 전까지는 줄 자체가 없다. 자리만 잡아두면 홈이 덜컹거린다.

export function TasteRow({
  title,
  initial,
}: {
  title: string
  /** 담아둔 추천. 아직 만든 적이 없으면 null 이다 */
  initial: LibraryItem[] | null
}) {
  const [items, setItems] = useState<LibraryItem[]>(initial ?? [])

  useEffect(() => {
    if (initial) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/space/taste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = (await res.json()) as { state: string; taste?: { picks: LibraryItem[] } }
        if (alive && data.state === 'ok' && data.taste) setItems(data.taste.picks)
      } catch {
        // 홈에서 조용히 실패한다. "내 취향" 화면이 같은 것을 다시 시도한다.
      }
    })()
    return () => {
      alive = false
    }
  }, [initial])

  if (items.length === 0) return null
  return <ContentRow row={{ key: 'taste', title, items }} />
}
