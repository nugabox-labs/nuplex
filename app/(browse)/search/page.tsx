import type { Metadata } from 'next'
import { CollectionCard } from '@/components/collection-row'
import { MovieCard } from '@/components/movie-card'
import { SearchBox } from '@/components/search-box'
import { searchCollections, searchItems } from '@/lib/library'

export const metadata: Metadata = { title: '검색' }
// 매 요청마다 DB 를 읽는다. 이게 없으면 빌드가 이 화면을 미리 렌더하려다 DB 연결에서
// 멈춘다 — NAS 배포에서 실제로 60초 타임아웃으로 빌드가 죽었다.
export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const term = (q ?? '').trim()
  const [results, collections] = term
    ? await Promise.all([searchItems(term), searchCollections(term)])
    : [[], []]

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-24 md:px-8">
      <SearchBox initialQuery={term} />

      <div className="mt-8">
        {term === '' ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            보고 싶은 작품 이름이나 배우 이름을 입력해 보세요.
          </p>
        ) : results.length === 0 && collections.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            &ldquo;{term}&rdquo; 검색 결과가 없습니다.
          </p>
        ) : (
          <>
            {collections.length > 0 ? (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">시리즈 모음</h2>
                <div className="flex flex-wrap gap-5 md:gap-x-6 md:gap-y-8">
                  {collections.map((collection) => (
                    <CollectionCard key={collection.ratingKey} collection={collection} />
                  ))}
                </div>
              </section>
            ) : null}

            {results.length > 0 ? (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                  작품 {results.length}편
                </h2>
                <div className="flex flex-wrap gap-5 md:gap-x-6 md:gap-y-8">
                  {results.map((item) => (
                    <MovieCard key={item.ratingKey} item={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
