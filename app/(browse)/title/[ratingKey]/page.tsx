import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink, Star } from 'lucide-react'
import { ContentRow } from '@/components/content-row'
import { SeasonList } from '@/components/season-list'
import {
  getCollectionItems,
  getCollectionsForItem,
  getCredits,
  getItem,
  getSeasons,
} from '@/lib/library'
import { formatLength, formatRating, metaLine, typeLabel } from '@/lib/format'

// 매 요청마다 DB 를 읽는다. 같은 호스트의 Postgres 조회라 충분히 빠르고,
// 빌드 시점에는 DB 가 없으므로 미리 렌더할 수도 없다.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ratingKey: string }>
}): Promise<Metadata> {
  const item = await getItem((await params).ratingKey)
  return { title: item?.title ?? '작품' }
}

export default async function TitlePage({
  params,
}: {
  params: Promise<{ ratingKey: string }>
}) {
  const { ratingKey } = await params
  const item = await getItem(ratingKey)
  if (!item) notFound()

  const [credits, seasons, collections] = await Promise.all([
    getCredits(ratingKey),
    item.type === 'show' ? getSeasons(ratingKey) : Promise.resolve([]),
    getCollectionsForItem(ratingKey),
  ])

  // 이 작품이 속한 시리즈의 다른 편들. 보통 0~1개라 한꺼번에 불러도 부담이 없다.
  const collectionRows = await Promise.all(
    collections.map(async (collection) => ({
      key: `collection-${collection.ratingKey}`,
      title: `${collection.title} ${collection.count}편`,
      href: `/collection/${collection.ratingKey}`,
      items: await getCollectionItems(collection.ratingKey),
    })),
  )

  const backdrop = item.backdrop ?? item.poster
  const rating = formatRating(item)

  return (
    <article className="pb-20">
      {/* 배경 */}
      <div className="relative h-[46vh] min-h-[300px] w-full overflow-hidden">
        {backdrop ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/20" />
      </div>

      <div className="relative z-10 -mt-28 px-4 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:gap-8">
          {item.poster ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.poster}
              alt=""
              className="w-36 shrink-0 rounded-lg border border-border object-cover shadow-2xl md:w-52"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {typeLabel(item.type)}
            </span>

            <h1 className="mt-3 text-pretty text-3xl font-black tracking-tight text-foreground md:text-5xl">
              {item.title}
            </h1>
            {item.originalTitle && item.originalTitle !== item.title ? (
              <p className="mt-1 text-sm text-muted-foreground">{item.originalTitle}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {rating ? (
                <span className="flex items-center gap-1 font-semibold text-primary">
                  <Star className="h-4 w-4 fill-primary" />
                  {rating}
                </span>
              ) : null}
              <span>{metaLine(item.year, formatLength(item), item.contentRating)}</span>
            </div>

            {item.tagline ? (
              <p className="mt-4 text-sm italic text-foreground/70">{item.tagline}</p>
            ) : null}
            {item.summary ? (
              <p className="mt-3 text-pretty text-sm leading-relaxed text-foreground/80 md:text-base">
                {item.summary}
              </p>
            ) : null}

            {item.genres.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            ) : null}

            <a
              href={item.plexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ExternalLink className="h-5 w-5" />
              Plex에서 보기
            </a>
          </div>
        </div>

        <div className="mx-auto max-w-5xl">
          {credits.directors.length > 0 || credits.writers.length > 0 || item.studio ? (
            <dl className="mt-10 grid gap-3 text-sm sm:grid-cols-3">
              {credits.directors.length > 0 ? (
                <div>
                  <dt className="text-muted-foreground">감독</dt>
                  <dd className="mt-1 text-foreground">{credits.directors.join(' · ')}</dd>
                </div>
              ) : null}
              {credits.writers.length > 0 ? (
                <div>
                  <dt className="text-muted-foreground">각본</dt>
                  <dd className="mt-1 text-foreground">{credits.writers.join(' · ')}</dd>
                </div>
              ) : null}
              {item.studio ? (
                <div>
                  <dt className="text-muted-foreground">제작</dt>
                  <dd className="mt-1 text-foreground">{item.studio}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {credits.cast.length > 0 ? (
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-bold text-foreground">출연</h2>
              <ul className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
                {credits.cast.map((person) => (
                  <li key={person.name} className="w-24 shrink-0 text-center">
                    <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-secondary">
                      {person.thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={person.thumb}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-xs font-medium text-foreground">
                      {person.name}
                    </p>
                    {person.character ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {person.character}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {seasons.length > 0 ? <SeasonList seasons={seasons} /> : null}
        </div>
      </div>

      {/* 같은 시리즈의 다른 편. 가로 스크롤이라 본문 너비 밖으로 뺀다 */}
      {collectionRows.length > 0 ? (
        <div className="relative z-10 mt-12 space-y-6 md:space-y-8">
          {collectionRows.map((row) => (
            <ContentRow key={row.key} row={row} />
          ))}
        </div>
      ) : null}
    </article>
  )
}
