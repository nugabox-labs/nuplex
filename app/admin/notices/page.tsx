import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { NoticeAdmin } from '@/components/notice-admin'

export const metadata: Metadata = { title: '알림 관리' }
export const dynamic = 'force-dynamic'

export default function AdminNoticesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <AdminNav current="notices" />
      <NoticeAdmin />
    </main>
  )
}
