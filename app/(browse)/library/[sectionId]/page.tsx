import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LibraryBrowser } from '@/components/library-browser'
import { getSection } from '@/lib/library'

// 매 요청마다 DB 를 읽는다. 같은 호스트의 Postgres 조회라 충분히 빠르고,
// 빌드 시점에는 DB 가 없으므로 미리 렌더할 수도 없다.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sectionId: string }>
}): Promise<Metadata> {
  const section = await getSection(Number((await params).sectionId))
  return { title: section?.title ?? '라이브러리' }
}

export default async function LibrarySectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string }>
  searchParams: Promise<{ sort?: string; page?: string }>
}) {
  const section = await getSection(Number((await params).sectionId))
  if (!section) notFound()

  return (
    <LibraryBrowser
      basePath={`/library/${section.id}`}
      heading={section.title}
      sectionId={section.id}
      searchParams={await searchParams}
    />
  )
}
