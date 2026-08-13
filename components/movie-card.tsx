'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { Star } from 'lucide-react'
import type { LibraryItem } from '@/lib/library'
import { formatRating, metaLine, typeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function MovieCard({ item }: { item: LibraryItem }) {
  const rating = formatRating(item)

  return (
    <motion.div
      whileHover={{ scale: 1.06, y: -6 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="w-40 shrink-0 sm:w-44 md:w-48"
    >
      <Link
        href={`/title/${item.ratingKey}`}
        className="group block overflow-hidden rounded-lg border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary">
          {item.poster ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.poster}
              alt=""
              className="h-full w-full object-cover transition duration-500 group-hover:brightness-75"
              loading="lazy"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
              {item.title}
            </span>
          )}

          {rating ? (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-medium text-foreground backdrop-blur-sm">
              <Star className="h-3 w-3 fill-primary text-primary" />
              {rating}
            </span>
          ) : null}
        </div>

        <div className="space-y-0.5 p-3">
          <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
          {/* "이어서 보기" 줄에서는 연도 · 장르 대신 어디부터 볼지를 보여준다 */}
          <p className={cn('truncate text-xs', item.badge ? 'text-primary' : 'text-muted-foreground')}>
            {item.badge ?? metaLine(item.year, item.genres[0] ?? typeLabel(item.type))}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
