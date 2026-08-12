import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin-nav'
import { ProfileAdmin } from '@/components/profile-admin'

export const metadata: Metadata = { title: '프로필 관리' }
export const dynamic = 'force-dynamic'

export default function AdminProfilesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <AdminNav current="profiles" />
      <ProfileAdmin />
    </main>
  )
}
