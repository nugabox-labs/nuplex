import type { Metadata } from 'next'
import Link from 'next/link'
import { NoticeAdmin } from '@/components/notice-admin'

export const metadata: Metadata = { title: '알림 관리' }
export const dynamic = 'force-dynamic'

export default function AdminNoticesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">알림 관리</h1>
        <Link href="/" className="text-sm text-muted-foreground transition hover:text-foreground">
          사이트로 →
        </Link>
      </div>
      <NoticeAdmin />
    </main>
  )
}
