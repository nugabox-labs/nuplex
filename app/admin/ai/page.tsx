import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { AiAdmin } from '@/components/ai-admin'

export const metadata: Metadata = { title: 'AI' }
export const dynamic = 'force-dynamic'

export default function AdminAiPage() {
  return (
    <main className="page-safe mx-auto max-w-3xl px-4 md:px-8">
      <AdminNav current="ai" />
      <AiAdmin />
    </main>
  )
}
