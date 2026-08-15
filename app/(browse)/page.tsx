import { cookies } from 'next/headers'
import { CollectionRow } from '@/components/collection-row'
import { ContentRow } from '@/components/content-row'
import { HeroCarousel } from '@/components/hero-carousel'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getHomeLayout, type HomeLayout } from '@/lib/profiles'
import {
  getContinueWatching,
  getFeaturedSeries,
  getHeroItems,
  getHomeRows,
  listShuffledCollections,
} from '@/lib/library'

// 매 요청마다 DB 를 읽는다. 같은 호스트의 Postgres 조회라 충분히 빠르고,
// 빌드 시점에는 DB 가 없으므로 미리 렌더할 수도 없다.
export const dynamic = 'force-dynamic'

/** 저장된 차례를 실제 줄 목록에 입힌다. 목록에 없는 줄은 원래 자리 뒤에 붙는다. */
function applyRowOrder<T extends { key: string }>(rows: T[], order: string[] | null): T[] {
  if (!order) return rows
  const rank = new Map(order.map((key, index) => [key, index]))
  return rows
    .map((row, index) => ({ row, rank: rank.get(row.key) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.row)
}

export default async function HomePage() {
  // 이어서 보기는 지금 들어와 있는 프로필의 것이다. 프로필이 없으면 줄 자체가 없다.
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)

  const [heroItems, rows, collections, featured, continueWatching, layout] = await Promise.all([
    getHeroItems(10),
    getHomeRows(),
    listShuffledCollections(),
    getFeaturedSeries(),
    profileId ? getContinueWatching(profileId) : [],
    profileId ? getHomeLayout(profileId) : ({ order: null, hidden: [] } as HomeLayout),
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

  // 순서를 바꿀 수 있는 줄들. 기본 차례는 FIXED_HOME_ROWS + 라이브러리 줄 순이다.
  const [recentRow, ...sectionRows] = rows
  const orderable = [
    featured.length > 0
      ? {
          key: 'featured',
          node: (
            <ContentRow row={{ key: 'featured', title: '현재 연재 중인 시리즈', items: featured }} />
          ),
        }
      : null,
    { key: 'recent', node: <ContentRow row={recentRow} /> },
    collections.length > 0
      ? { key: 'collections', node: <CollectionRow collections={collections} href="/collections" /> }
      : null,
    ...sectionRows.map((row) => ({ key: row.key, node: <ContentRow row={row} /> })),
  ].filter((row) => row !== null)

  return (
    <>
      <HeroCarousel items={heroItems} />

      <div className="relative z-10 -mt-10 space-y-6 pb-20 md:-mt-16 md:space-y-8">
        {/* 보다 만 시리즈 — 그 사람 것이라 맨 위에 둔다 */}
        {continueWatching.length > 0 ? (
          <ContentRow row={{ key: 'continue', title: '이어서 보기', items: continueWatching }} />
        ) : null}

        {/* 나머지 줄은 프로필에 저장된 차례를 따른다(프로필 메뉴 → 홈 화면 설정).
            저장 뒤에 생긴 줄은 뒤로 가되 사라지지 않는다. 서버에서 순서를 맞춰
            내려보내므로 화면이 한 번 그려진 뒤 재배열되는 일이 없다 */}
        {applyRowOrder(orderable, layout.order)
          .filter((row) => !layout.hidden.includes(row.key))
          .map((row) => (
            <div key={row.key}>{row.node}</div>
          ))}
      </div>
    </>
  )
}
