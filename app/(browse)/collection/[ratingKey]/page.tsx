import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Layers } from 'lucide-react'
import { MovieCard } from '@/components/movie-card'
import { getCollection, getCollectionItems } from '@/lib/library'

// 매 요청마다 DB 를 읽는다. 같은 호스트의 Postgres 조회라 충분히 빠르고,
// 빌드 시점에는 DB 가 없으므로 미리 렌더할 수도 없다.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ratingKey: string }>
}): Promise<Metadata> {
  const collection = await getCollection((await params).ratingKey)
  return { title: collection?.title ?? '시리즈' }
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ ratingKey: string }>
}) {
  const { ratingKey } = await params
  const collection = await getCollection(ratingKey)
  if (!collection) notFound()

  const items = await getCollectionItems(ratingKey)
  const backdrop = collection.backdrop ?? collection.poster

  return (
    <article className="pb-20">
      <div className="relative h-[38vh] min-h-[240px] w-full overflow-hidden">
        {backdrop ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
      </div>

      <div className="relative z-10 -mt-24 px-4 md:px-8">
        <div className="mx-auto max-w-6xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Layers className="h-3.5 w-3.5" />
            시리즈 모음
          </span>

          <h1 className="mt-3 text-pretty text-3xl font-black tracking-tight text-foreground md:text-4xl">
            {collection.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{items.length}편</p>

          {collection.summary ? (
            <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-foreground/80">
              {collection.summary}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-5 md:gap-x-6 md:gap-y-8">
            {items.map((item) => (
              <MovieCard key={item.ratingKey} item={item} />
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}
