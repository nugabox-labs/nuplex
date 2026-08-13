import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { FeaturedAdmin } from '@/components/featured-admin'

export const metadata: Metadata = { title: '연재 중인 시리즈' }
export const dynamic = 'force-dynamic'

export default function AdminFeaturedPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <AdminNav current="featured" />
      <FeaturedAdmin />
    </main>
  )
}
