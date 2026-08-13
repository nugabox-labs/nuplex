import { cookies } from 'next/headers'
import { Navbar } from '@/components/navbar'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getLastSync, getSections, groupSections } from '@/lib/library'
import { getCurrentProfile } from '@/lib/profiles'
import { formatRelativeTime } from '@/lib/format'

// 로그인 화면을 뺀 모든 화면이 쓰는 껍데기.
export default async function BrowseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // DB 가 아직 안 올라왔어도 화면은 떠야 한다.
  const [lastSync, sections] = await Promise.all([
    getLastSync().catch(() => null),
    getSections().catch(() => []),
  ])

  // 관리자 화면 진입점은 Plex 서버 소유 계정(NUGA)으로 들어왔을 때만 보여준다.
  // 이름으로 맞추지 않는다 — 표시 이름은 관리자가 바꿀 수 있어서 그때 조용히 사라진다.
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)
  const profile = profileId ? await getCurrentProfile(profileId).catch(() => null) : null

  return (
    <div className="min-h-screen bg-background">
      <Navbar groups={groupSections(sections)} showAdminLink={profile?.isPlexAdmin ?? false} />
      <main>{children}</main>

      <footer className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground md:px-8">
        <span className="font-logo text-lg font-black tracking-tight">
          <span className="text-foreground">NU</span>
          <span className="text-primary">PLEX</span>
        </span>
        <p className="mt-2">
          {lastSync
            ? `마지막 동기화 ${formatRelativeTime(lastSync.finishedAt)}${
                lastSync.status === 'failed' ? ' · 실패' : ''
              }`
            : '아직 동기화된 적이 없습니다.'}
        </p>
      </footer>
    </div>
  )
}
