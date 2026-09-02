import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { ScanAdmin } from '@/components/scan-admin'
import { SyncAdmin } from '@/components/sync-admin'

export const metadata: Metadata = { title: '라이브러리 스캔' }
export const dynamic = 'force-dynamic'

export default function AdminScanPage() {
  return (
    <main className="page-safe mx-auto max-w-3xl px-4 md:px-8">
      <AdminNav current="scan" />
      {/* 동기화가 위, 스캔이 아래다. 둘은 다른 일이고 순서도 스캔 → 동기화지만,
          관리자가 "화면에 안 올라온다" 로 들어오는 자리라 손이 먼저 닿아야 한다. */}
      <SyncAdmin />
      <ScanAdmin />
    </main>
  )
}
