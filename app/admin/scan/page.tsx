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
      {/* 일이 벌어지는 순서대로 둔다 — Plex 가 파일을 훑고(스캔), 그걸 우리가 읽어 온다(동기화). */}
      <ScanAdmin />
      <SyncAdmin />
    </main>
  )
}
