'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// 화면 전체를 굴리는 스크롤 통.
//
// 문서(html · body)를 굴리면 iOS 에서 상단을 잡아당길 때 당겨서 새로고침이 걸리고,
// 고정 헤더까지 통째로 딸려 내려온다. 그렇다고 overscroll-behavior-y: none 으로 막으면
// 위아래 튕김(러버밴드)이 같이 죽어서 맨 아래에서 툭 멈춘다.
// 그래서 문서는 못 굴리게 잠그고, 헤더 바깥에 있는 이 통만 굴린다.
// 안쪽 스크롤 통은 새로고침 제스처를 만들지 않으면서 양 끝에서 튕긴다.
export function AppScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  // 뒤로 · 앞으로 가기인지 표시한다. 그때는 맨 위로 올리지 않고 보던 자리로 되돌린다.
  const popped = useRef(false)
  const positions = useRef(new Map<string, number>())

  // useSearchParams 를 쓰면 최상위 레이아웃이 통째로 동적 렌더링으로 떨어진다.
  // 질의 문자열은 효과 안에서 직접 읽는다.
  const currentKey = useRef(pathname)

  useEffect(() => {
    const onPop = () => {
      popped.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 화면을 떠나기 전에 지금 위치를 적어 둔다.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const save = () => positions.current.set(currentKey.current, node.scrollTop)
    node.addEventListener('scroll', save, { passive: true })
    return () => {
      save()
      node.removeEventListener('scroll', save)
    }
  }, [])

  // 브라우저가 문서 스크롤을 되살리려 드는 것을 막는다 — 문서는 굴러가지 않는다.
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    const key = pathname + window.location.search
    currentKey.current = key
    const node = ref.current
    if (!node) return
    const saved = popped.current ? positions.current.get(key) : undefined
    popped.current = false
    node.scrollTo({ top: saved ?? 0 })
  }, [pathname])

  return (
    <div ref={ref} id="app-scroll" className="h-[100dvh] w-full overflow-y-auto overflow-x-hidden">
      {children}
    </div>
  )
}
