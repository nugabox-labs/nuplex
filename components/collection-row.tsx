'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import type { Collection } from '@/lib/library'

// Plex 에서 사람이 직접 묶은 시리즈 모음. 사람이 직접 고른 포스터가 있으니
// 그걸 쓴다 — 배경 이미지는 어느 장면이냐에 따라 무슨 시리즈인지 알아보기 어렵다.
// 모양은 작품 카드와 같은 세로 2:3 이고, 제목 줄에 붙은 아이콘으로 구분된다.

export function CollectionRow({
  collections,
  title = '시리즈 모음',
  href,
}: {
  collections: Collection[]
  title?: string
  href?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  if (collections.length === 0) return null

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <section className="group/row relative">
      <h2 className="mb-4 flex items-center gap-2 px-4 text-lg font-bold text-foreground md:px-8 md:text-xl">
        <Layers className="h-5 w-5 text-primary" />
        {href ? (
          <Link href={href} className="transition hover:text-primary">
            {title}
            <span className="ml-1 text-base font-normal text-muted-foreground">›</span>
          </Link>
        ) : (
          title
        )}
      </h2>

      <div className="relative">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="왼쪽으로"
          className="absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/70 p-2 text-foreground opacity-0 backdrop-blur-sm transition hover:bg-background hover:text-primary group-hover/row:opacity-100 md:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="오른쪽으로"
          className="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/70 p-2 text-foreground opacity-0 backdrop-blur-sm transition hover:bg-background hover:text-primary group-hover/row:opacity-100 md:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div
          ref={scrollerRef}
          className="no-scrollbar flex gap-5 overflow-x-auto scroll-smooth px-4 pb-5 pt-1 md:gap-6 md:px-8"
        >
          {collections.map((collection) => (
            <CollectionCard key={collection.ratingKey} collection={collection} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function CollectionCard({ collection }: { collection: Collection }) {
  const image = collection.poster ?? collection.backdrop

  return (
    <Link
      href={`/collection/${collection.ratingKey}`}
      className="group w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-44 md:w-48"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary">
        {image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:brightness-75"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {collection.title}
          </span>
        )}
      </div>

      <div className="space-y-0.5 p-3">
        <h3 className="truncate text-sm font-semibold text-foreground">{collection.title}</h3>
        <p className="truncate text-xs text-muted-foreground">{collection.count}편</p>
      </div>
    </Link>
  )
}
