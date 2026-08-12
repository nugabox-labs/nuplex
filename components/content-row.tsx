'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LibraryRow } from '@/lib/library'
import { MovieCard } from './movie-card'
import { SectionTitle } from './section-title'

export function ContentRow({ row }: { row: LibraryRow }) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <section className="group/row relative">
      <h2 className="mb-4 px-4 text-lg font-bold text-foreground md:px-8 md:text-xl">
        {row.href ? (
          <Link href={row.href} className="transition hover:text-primary">
            <SectionTitle title={row.title} />
            <span className="ml-1 text-base font-normal text-muted-foreground">›</span>
          </Link>
        ) : (
          <SectionTitle title={row.title} />
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
          className="no-scrollbar flex gap-5 overflow-x-auto scroll-smooth px-4 pb-5 pt-2 md:gap-6 md:px-8"
        >
          {row.items.map((item) => (
            <MovieCard key={`${row.key}-${item.ratingKey}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
