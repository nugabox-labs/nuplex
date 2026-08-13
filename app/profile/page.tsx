import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ProfilePicker } from '@/components/profile-picker'
import { listEnabledProfiles } from '@/lib/profiles'

export const metadata: Metadata = { title: '프로필 선택' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const profiles = await listEnabledProfiles()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <h1 className="font-logo text-3xl font-black tracking-tight">
        <span className="text-foreground">NU</span>
        <span className="text-primary">PLEX</span>
      </h1>
      <p className="mb-12 mt-3 text-center text-lg text-muted-foreground">
        누가 보고 있나요?
      </p>

      {profiles.length === 0 ? (
        <p className="max-w-md text-center text-sm text-muted-foreground">
          아직 사용할 수 있는 프로필이 없습니다. 관리자에게 문의해 주세요.
        </p>
      ) : (
        // 고른 뒤 어디로 갈지(`?next=`)를 읽는다 — useSearchParams 는 경계가 필요하다.
        <Suspense>
          <ProfilePicker profiles={profiles} />
        </Suspense>
      )}
    </main>
  )
}
