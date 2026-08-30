import { cookies } from 'next/headers'
import { CollectionRow } from '@/components/collection-row'
import { ContentRow } from '@/components/content-row'
import { HeroCarousel } from '@/components/hero-carousel'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getCurrentProfile, getHomeLayout, type HomeLayout } from '@/lib/profiles'
import {
  TASTE_ROW_KEY,
  getContinueWatching,
  getFeaturedSeries,
  getHeroItems,
  getHomeRows,
  getTaste,
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

/**
 * 장르 줄을 라이브러리 줄 사이에 흩어 놓는다.
 *
 * **매 요청마다 다시 뽑지 않는다.** 새로고침할 때마다 줄이 옮겨 다니면 아까 본 줄을
 * 다시 찾을 수가 없다. 프로필과 날짜로 자리를 정해 하루 동안 같은 자리에 두고, 날이
 * 바뀌면 다른 자리로 간다.
 *
 * 첫 줄(연재 중 · 최근 추가)보다 앞에는 넣지 않는다 — 홈의 얼굴이라 그대로 둔다.
 */
function spreadGenreRows<T>(base: T[], genreRows: T[], seed: number): T[] {
  if (genreRows.length === 0) return base

  const slots = Math.max(1, base.length - 1)
  const taken = new Set<number>()
  const at = new Map<number, T[]>()

  genreRows.forEach((row, index) => {
    // 자리를 고르게 벌린 뒤 시드로 조금씩 밀어 준다. 한곳에 몰리지 않는다.
    const spread = Math.floor(((index + 1) * slots) / (genreRows.length + 1))
    let position = 1 + ((spread + (seed % 3) + index) % slots)
    while (taken.has(position) && taken.size < slots) position = 1 + (position % slots)
    taken.add(position)
    at.set(position, [...(at.get(position) ?? []), row])
  })

  return base.flatMap((row, index) => [row, ...(at.get(index + 1) ?? [])])
}

/** 프로필 · 날짜로 만드는 자리 시드. 같은 날 같은 사람은 같은 홈을 본다. */
function dailySeed(profileId: number): number {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  let hash = profileId
  for (const char of today) hash = (hash * 31 + char.charCodeAt(0)) % 100000
  return hash
}

export default async function HomePage() {
  // 이어서 보기는 지금 들어와 있는 프로필의 것이다. 프로필이 없으면 줄 자체가 없다.
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)

  const [heroItems, rows, collections, featured, continueWatching, layout, profile, taste] =
    await Promise.all([
      getHeroItems(10),
      getHomeRows(),
      listShuffledCollections(),
      getFeaturedSeries(),
      profileId ? getContinueWatching(profileId) : [],
      profileId ? getHomeLayout(profileId) : ({ order: null, hidden: [] } as HomeLayout),
      profileId ? getCurrentProfile(profileId) : null,
      // 취향 분석은 sync 워커가 미리 만들어 둔다. 여기서는 읽기만 한다(sync/taste.ts).
      profileId ? getTaste(profileId).catch(() => null) : null,
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

  // 취향 줄은 홈 화면 설정에서 통째로 끌 수 있다. 끄면 "볼 만한 작품" 도 장르 줄도 없다.
  const showTaste = Boolean(taste) && !layout.hidden.includes(TASTE_ROW_KEY)

  // 순서를 바꿀 수 있는 줄들. 기본 차례는 FIXED_HOME_ROWS + 라이브러리 줄 순이다.
  const [recentRow, ...sectionRows] = rows
  const orderable = [
    featured.length > 0
      ? {
          key: 'featured',
          node: (
            <ContentRow
              row={{ key: 'featured', title: 'NUPLEX 에서 연재 중인 시리즈', items: featured }}
            />
          ),
        }
      : null,
    { key: 'recent', node: <ContentRow row={recentRow} /> },
    collections.length > 0
      ? { key: 'collections', node: <CollectionRow collections={collections} href="/collections" /> }
      : null,
    ...sectionRows.map((row) => ({ key: row.key, node: <ContentRow row={row} /> })),
  ].filter((row) => row !== null)

  const ordered = applyRowOrder(orderable, layout.order).filter(
    (row) => !layout.hidden.includes(row.key),
  )

  // "볼 만한 스릴러 작품" 같은 줄. 라이브러리 줄 사이사이에 흩어 놓는다.
  const genreRows =
    showTaste && taste
      ? taste.genreRows.map((row) => ({
          key: `taste-genre-${row.genre}`,
          node: (
            <ContentRow
              row={{
                key: `taste-genre-${row.genre}`,
                title: `볼 만한 ${row.genre} 작품`,
                items: row.items,
              }}
            />
          ),
        }))
      : []

  return (
    <>
      <HeroCarousel items={heroItems} />

      <div className="relative z-10 -mt-10 space-y-6 pb-20 md:-mt-16 md:space-y-8">
        {/* 보다 만 시리즈 — 그 사람 것이라 맨 위에 둔다 */}
        {continueWatching.length > 0 ? (
          <ContentRow
            row={{
              key: 'continue',
              title: profile ? `${profile.name}님이 보고 있던 작품` : '이어서 보기',
              items: continueWatching,
            }}
          />
        ) : null}

        {/* AI 가 고른 작품. 이어서 보기와 같이 그 사람 것이라 차례를 바꾸지 않는다 */}
        {showTaste && taste && taste.picks.length > 0 && profile ? (
          <ContentRow
            row={{
              key: TASTE_ROW_KEY,
              title: `${profile.name}님이 볼 만한 작품`,
              items: taste.picks,
            }}
          />
        ) : null}

        {/* 나머지 줄은 프로필에 저장된 차례를 따른다(프로필 메뉴 → 홈 화면 설정).
            저장 뒤에 생긴 줄은 뒤로 가되 사라지지 않는다. 서버에서 순서를 맞춰
            내려보내므로 화면이 한 번 그려진 뒤 재배열되는 일이 없다.
            장르 줄은 차례에 끼지 않고 그 사이사이에 흩어진다 */}
        {spreadGenreRows(ordered, genreRows, dailySeed(profileId ?? 0)).map((row) => (
          <div key={row.key}>{row.node}</div>
        ))}
      </div>
    </>
  )
}
