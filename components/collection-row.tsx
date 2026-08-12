'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import type { Collection } from '@/lib/library'

// Plex 에서 사람이 직접 묶은 시리즈 모음. 작품 카드(세로 2:3)와 구분되도록
// 가로로 넓은 카드에 배경 이미지를 깐다.

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
  const image = collection.backdrop ?? collection.poster

  return (
    <Link
      href={`/collection/${collection.ratingKey}`}
      className="group relative aspect-video w-56 shrink-0 overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:w-64"
    >
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="line-clamp-2 text-sm font-bold text-foreground">{collection.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{collection.count}편</p>
      </div>
    </Link>
  )
}
