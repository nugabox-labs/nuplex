import type { Metadata } from 'next'
import { CollectionCard } from '@/components/collection-row'
import { SectionTitle } from '@/components/section-title'
import { groupCollectionsBySection, listCollections } from '@/lib/library'

export const metadata: Metadata = { title: '시리즈 모음' }
export const dynamic = 'force-dynamic'

// 이 화면만 순서가 다르다. 모음이 가장 많은 외국 영화를 앞에 세운다 —
// 상단 메뉴 · 라이브러리 화면의 차례(compareSectionTitles)는 그대로 둔다.
const SECTION_ORDER = ['영화 | 외국', '영화 | 한국']

function orderIndex(title: string): number {
  const index = SECTION_ORDER.indexOf(title.trim().replace(/\s*\|\s*/g, ' | '))
  return index === -1 ? SECTION_ORDER.length : index
}

export default async function CollectionsPage() {
  const collections = await listCollections()
  // 목록에 없는 구분은 원래 차례를 지킨다(정렬이 안정적이라 그대로 뒤에 남는다).
  const groups = groupCollectionsBySection(collections).sort(
    (a, b) => orderIndex(a.sectionTitle) - orderIndex(b.sectionTitle),
  )

  return (
    <div className="page-top px-4 pb-20 md:px-8">
      <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
        시리즈 모음
        <span className="ml-2 text-base font-normal text-muted-foreground">
          {collections.length}개
        </span>
      </h1>
      <p className="mb-10 text-sm text-muted-foreground">
        Plex 라이브러리에 직접 묶어둔 모음입니다.
      </p>

      {groups.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          Plex 에 만들어둔 컬렉션이 없습니다.
        </p>
      ) : (
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.sectionId}>
              <h2 className="mb-4 border-b border-border pb-2 text-lg font-bold text-foreground md:text-xl">
                <SectionTitle title={group.sectionTitle} />
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {group.collections.length}개
                </span>
              </h2>
              <div className="flex flex-wrap gap-5 md:gap-x-6 md:gap-y-8">
                {group.collections.map((collection) => (
                  <CollectionCard key={collection.ratingKey} collection={collection} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
