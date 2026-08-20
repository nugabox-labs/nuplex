import Link from 'next/link'
import { CollectionRow } from '@/components/collection-row'
import { MovieCard } from '@/components/movie-card'
import { SectionTitle } from '@/components/section-title'
import { listCollections, listItems, type SortKey } from '@/lib/library'

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
    page === 1 ? listCollections(sectionId) : Promise.resolve([]),
  ])
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-top pb-20">
      {/* 제목이 맨 먼저다. 컬렉션이 있는 분류만 시리즈 모음 줄이 위에 붙어
          제목이 아래로 밀려 있었다 — 같은 분류인데 화면마다 첫 줄이 달라진다.
          시리즈 모음은 제목 아래, 작품 그리드 위에 둔다. */}
      <div className="px-4 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          <SectionTitle title={heading} />
          <span className="ml-2 text-base font-normal text-muted-foreground">{total}편</span>
        </h1>

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

      {collections.length > 0 ? (
        <div className="mb-8 -mx-4 md:-mx-8">
          <CollectionRow collections={collections} />
        </div>
      ) : null}

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
