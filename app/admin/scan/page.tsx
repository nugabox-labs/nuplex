import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { ScanAdmin } from '@/components/scan-admin'

export const metadata: Metadata = { title: '라이브러리 스캔' }
export const dynamic = 'force-dynamic'

export default function AdminScanPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <AdminNav current="scan" />
      <ScanAdmin />
    </main>
  )
}
