import Link from 'next/link'
import { CollectionRow } from '@/components/collection-row'
import { MovieCard } from '@/components/movie-card'
import { SectionTitle } from '@/components/section-title'
import { listItems, listShuffledCollections, type SortKey } from '@/lib/library'

// 영화 · 시리즈 목록 화면. 두 페이지가 정렬 · 페이지네이션까지 똑같이 쓰므로 하나로 둔다.

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'added', label: '최근 추가순' },
  { key: 'title', label: '가나다순' },
  { key: 'year', label: '최신 개봉순' },
  { key: 'rating', label: '평점순' },
]

const PAGE_SIZE = 60

function isSortKey(value: unknown): value is SortKey {
  return SORTS.some((s) => s.key === value)
}

export async function LibraryBrowser({
  basePath,
  heading,
  sectionId,
  searchParams,
}: {
  basePath: string
  heading: string
  sectionId: number
  searchParams: { sort?: string; page?: string }
}) {
  const sort: SortKey = isSortKey(searchParams.sort) ? searchParams.sort : 'added'
  const page = Math.max(1, Number(searchParams.page) || 1)

  const [{ items, total }, collections] = await Promise.all([
    listItems({ sectionId, sort, page, pageSize: PAGE_SIZE }),
    // 컬렉션 띠는 첫 페이지에만 보여준다. 2페이지부터도 계속 나오면 거슬린다.
    // 홈과 마찬가지로 들어올 때마다 섞는다 — 뒤쪽 모음도 눈에 걸리게.
    page === 1 ? listShuffledCollections(sectionId) : Promise.resolve([]),
  ])
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-top pb-20">
      {/* 화면의 뼈대는 어느 분류에서나 같다 —
            분류 이름 → 시리즈 모음 → 전체 작품 + 정렬 → 그리드.

          컬렉션이 있고 없고에 따라 첫 줄이 달라지면 같은 성격의 화면인데도
          매번 다시 읽어야 한다. 그래서 시리즈 모음이 없는 분류에서도 소제목과
          정렬 줄은 그대로 둔다.

          개수는 h1 이 아니라 소제목이 진다. 위는 "어느 분류인가", 아래는
          "그 안에 낱개가 몇 개인가" 로 역할이 갈린다. 소제목을 "전체 작품" 으로
          둔 것은 바로 위 "시리즈 모음" 과 대구를 이루기 위해서다 — 묶음 ↔ 낱개. */}
      <div className="px-4 md:px-8">
        <h1 className="mb-6 text-2xl font-bold text-foreground md:text-3xl">
          <SectionTitle title={heading} />
        </h1>

      {collections.length > 0 ? (
        <div className="mb-8 -mx-4 md:-mx-8">
          <CollectionRow collections={collections} />
        </div>
      ) : null}

      {/* 이 줄이 목록의 시작을 알리는 경계도 겸한다. 시리즈 모음이 가로 스크롤이라
          선이나 여백만으로는 어디서 끝났는지 잘 보이지 않는다. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-3">
        <h2 className="text-lg font-bold text-foreground md:text-xl">
          전체 작품
          <span className="ml-2 text-sm font-normal text-muted-foreground">{total}편</span>
        </h2>

        <div className="flex flex-wrap gap-1">
          {SORTS.map((option) => (
            <Link
              key={option.key}
              href={`${basePath}?sort=${option.key}`}
              className={
                option.key === sort
                  ? 'rounded-md bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground'
              }
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">작품이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-5 md:gap-x-6 md:gap-y-8">
          {items.map((item) => (
            <MovieCard key={item.ratingKey} item={item} />
          ))}
        </div>
      )}

      {lastPage > 1 ? (
        <nav className="mt-10 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`${basePath}?sort=${sort}&page=${page - 1}`}
              className="rounded-md border border-border px-4 py-2 text-foreground transition hover:bg-secondary"
            >
              이전
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            {page} / {lastPage}
          </span>
          {page < lastPage ? (
            <Link
              href={`${basePath}?sort=${sort}&page=${page + 1}`}
              className="rounded-md border border-border px-4 py-2 text-foreground transition hover:bg-secondary"
            >
              다음
            </Link>
          ) : null}
        </nav>
      ) : null}
      </div>
    </div>
  )
}
