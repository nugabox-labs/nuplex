import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { ScanAdmin } from '@/components/scan-admin'

export const metadata: Metadata = { title: '라이브러리 스캔' }
export const dynamic = 'force-dynamic'

export default function AdminScanPage() {
  return (
    <main className="page-safe mx-auto max-w-3xl px-4 md:px-8">
      <AdminNav current="scan" />
      {/* 스캔과 동기화는 하나의 흐름이다 — 스캔 대기가 다 없어지면 동기화가 이어서 돈다. */}
      <ScanAdmin />
    </main>
  )
}
