'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { SeasonWithEpisodes } from '@/lib/library'
import { formatDuration, metaLine } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PlexLink } from './plex-link'

export function SeasonList({ seasons }: { seasons: SeasonWithEpisodes[] }) {
  const [selected, setSelected] = useState(0)
  const season = seasons[selected]
  if (!season) return null

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap gap-1">
        {seasons.map((s, index) => (
          <button
            key={s.ratingKey}
            type="button"
            onClick={() => setSelected(index)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              index === selected
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.title}
          </button>
        ))}
      </div>

      {season.episodes.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          에피소드 정보가 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {season.episodes.map((episode) => (
            <li key={episode.ratingKey}>
              <PlexLink
                href={episode.plexUrl}
                className="group flex gap-4 rounded-lg p-3 transition hover:bg-secondary/50"
              >
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-secondary sm:w-44">
                  {episode.thumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={episode.thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    <span className="truncate">
                      {episode.episodeIndex ? `${episode.episodeIndex}. ` : ''}
                      {episode.title}
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {metaLine(episode.airDate, formatDuration(episode.durationMs))}
                  </p>
                  {episode.summary ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {episode.summary}
                    </p>
                  ) : null}
                </div>
              </PlexLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
