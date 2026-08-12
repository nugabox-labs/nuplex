import { CollectionRow } from '@/components/collection-row'
import { ContentRow } from '@/components/content-row'
import { HeroCarousel } from '@/components/hero-carousel'
import { getHeroItems, getHomeRows, listCollections } from '@/lib/library'

// 매 요청마다 DB 를 읽는다. 같은 호스트의 Postgres 조회라 충분히 빠르고,
// 빌드 시점에는 DB 가 없으므로 미리 렌더할 수도 없다.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [heroItems, rows, collections] = await Promise.all([
    getHeroItems(10),
    getHomeRows(),
    listCollections(),
  ])

  if (rows.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">아직 보여줄 작품이 없습니다</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Plex 동기화가 아직 끝나지 않았거나, 라이브러리가 비어 있습니다.
          최초 동기화는 라이브러리 크기에 따라 시간이 걸립니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <HeroCarousel items={heroItems} />

      <div className="relative z-10 -mt-10 space-y-6 pb-20 md:-mt-16 md:space-y-8">
        {/* 최근 추가 바로 다음에 시리즈 모음을 끼운다 */}
        {rows.slice(0, 1).map((row) => (
          <ContentRow key={row.key} row={row} />
        ))}
        <CollectionRow collections={collections} href="/collections" />
        {rows.slice(1).map((row) => (
          <ContentRow key={row.key} row={row} />
        ))}
      </div>
    </>
  )
}
