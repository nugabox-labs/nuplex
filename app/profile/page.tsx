import { Suspense } from 'react'
import Link from 'next/link'
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
      {profiles.length === 0 ? (
        <p className="mt-12 max-w-md text-center text-sm text-muted-foreground">
          아직 사용할 수 있는 프로필이 없습니다. 관리자에게 문의해 주세요.
        </p>
      ) : (
        // 고른 뒤 어디로 갈지(`?next=`)를 읽는다 — useSearchParams 는 경계가 필요하다.
        //
        // "누가 보고 있나요?" 를 이 안에 둔다. 밖에 두면 서버가 먼저 그려서 글씨만
        // 덩그러니 떠 있다가 프로필이 나중에 붙는다. 기다리는 동안에는 로고만 보이고
        // 준비되면 글씨와 프로필이 같이 나타나야 한다.
        <Suspense>
          <p className="mb-12 mt-3 text-center text-lg text-muted-foreground">누가 보고 있나요?</p>
          <ProfilePicker profiles={profiles} />
        </Suspense>
      )}

      {/* 입장 화면으로 돌아가는 길. 밑줄 없이 글자만 밝아진다 */}
      <Link
        href="/welcome"
        className="mt-16 text-sm text-muted-foreground no-underline transition hover:text-foreground"
      >
        ← 돌아가기
      </Link>
    </main>
  )
}
