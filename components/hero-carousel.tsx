'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Info, Play, Star } from 'lucide-react'
import type { LibraryItem } from '@/lib/library'
import { formatLength, formatRating, metaLine, typeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PlexLink } from './plex-link'

// 최근 추가된 작품을 배경째로 넘겨 보여준다.
// 자동으로 넘어가되, 사람이 직접 넘기면 그때부터 멈춘다 — 읽는 중에 화면이
// 바뀌어버리는 게 가장 거슬리기 때문이다.
// 넘기는 방법은 세 가지: 화살표 · 점 · 좌우로 밀기.

const INTERVAL_MS = 7000
/** 이만큼은 가로로 밀어야 넘긴다. 세로로 스크롤하다 스친 것과 구분하는 값 */
const SWIPE_PX = 60

export function HeroCarousel({ items }: { items: LibraryItem[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  /** 사람이 한 번이라도 직접 넘겼는지. 마우스가 떠나도 다시 돌지 않게 하는 빗장 */
  const [chosen, setChosen] = useState(false)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const go = useCallback(
    (next: number) => {
      setIndex(((next % items.length) + items.length) % items.length)
      setChosen(true)
    },
    [items.length],
  )

  // 손가락 · 마우스로 밀어서 넘기기. 버튼 · 링크 위에서 시작한 동작은 건드리지 않는다.
  function onPointerDown(event: React.PointerEvent) {
    const onControl = (event.target as HTMLElement).closest('a, button')
    swipeStart.current = onControl ? null : { x: event.clientX, y: event.clientY }
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return
    go(index + (dx < 0 ? 1 : -1))
  }

  useEffect(() => {
    if (paused || chosen || items.length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [paused, chosen, items.length])

  // 배경 이미지는 미리 받아둔 로컬 파일이라 다음 장을 먼저 깔아둬도 부담이 없다.
  useEffect(() => {
    const next = items[(index + 1) % items.length]
    const image = next?.backdrop ?? next?.poster
    if (image) new Image().src = image
  }, [index, items])

  if (items.length === 0) return null
  const item = items[index]
  const backdrop = item.backdrop ?? item.poster
  const rating = formatRating(item)

  return (
    <section
      className="relative h-[80vh] min-h-[520px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStart.current = null
      }}
      aria-roledescription="carousel"
      aria-label="최근 추가된 작품"
    >
      {/* 배경만 교차 페이드한다. 글자까지 같이 흐려지면 읽는 데 방해가 된다. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={item.ratingKey}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.9 }, scale: { duration: 7, ease: 'linear' } }}
          className="absolute inset-0"
        >
          {backdrop ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={backdrop} alt="" className="h-full w-full object-cover" />
          ) : null}
        </motion.div>
      </AnimatePresence>

      {/* 글자가 읽히도록 덮는 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

      {/* 좁은 화면에서는 본문이 아래에 붙는다. 아래 여백을 키우면 덩어리가 통째로
          위로 올라가 상단 바에 닿는다 — 화살표 줄이 생기며 덩어리가 커져서
          여백을 pb-28 에서 줄였다. */}
      <div className="relative flex h-full items-end pb-20 md:items-center md:pb-0">
        <div className="max-w-2xl px-4 md:px-8 lg:px-16">
          <motion.div
            key={item.ratingKey}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wider text-primary">
              {typeLabel(item.type)}
            </span>

            <h1 className="mt-4 text-pretty text-4xl font-black leading-tight tracking-tight text-foreground md:text-6xl">
              {item.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {rating ? (
                <span className="flex items-center gap-1 font-semibold text-primary">
                  <Star className="h-4 w-4 fill-primary" />
                  {rating}
                </span>
              ) : null}
              <span>
                {metaLine(item.year, formatLength(item), item.genres.slice(0, 3).join(' · '))}
              </span>
            </div>

            {item.summary ? (
              <p className="mt-4 line-clamp-3 max-w-xl text-pretty text-sm leading-relaxed text-foreground/80 md:text-base">
                {item.summary}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PlexLink
                href={item.plexUrl}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Play className="h-5 w-5 fill-current" />
                Plex에서 시청하기
              </PlexLink>
              <Link
                href={`/title/${item.ratingKey}`}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-sm transition hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Info className="h-5 w-5" />
                상세 정보
              </Link>
            </div>
          </motion.div>

          {/* 점은 본문 흐름 안에 둔다. 히어로 하단에 절대배치하면 홈에서 아래 줄을
              -mt 로 끌어올릴 때 "최근 추가" 제목과 겹친다(데스크탑 · 모바일 모두). */}
          {items.length > 1 ? (
            <div className="mt-5 flex items-center">
              <ArrowButton label="이전 작품" onClick={() => go(index - 1)}>
                <ChevronLeft className="h-5 w-5" />
              </ArrowButton>

              {/* 점은 얇게 보이되 누르는 자리는 손가락 크기로 넓혀둔다 */}
              <div className="mx-2 flex items-center">
                {items.map((entry, i) => (
                  <button
                    key={entry.ratingKey}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`${i + 1}번째 작품 · ${entry.title}`}
                    aria-current={i === index}
                    className="group flex h-9 items-center px-1"
                  >
                    <span
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        i === index
                          ? 'w-8 bg-primary'
                          : 'w-1.5 bg-foreground/30 group-hover:bg-foreground/60',
                      )}
                    />
                  </button>
                ))}
              </div>

              <ArrowButton label="다음 작품" onClick={() => go(index + 1)}>
                <ChevronRight className="h-5 w-5" />
              </ArrowButton>
            </div>
          ) : null}
        </div>
      </div>

    </section>
  )
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/60 text-foreground backdrop-blur-sm transition hover:bg-secondary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  )
}
