import { cookies } from 'next/headers'
import { Navbar } from '@/components/navbar'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getSections, groupSections } from '@/lib/library'
import { getCurrentProfile } from '@/lib/profiles'

// 로그인 화면을 뺀 모든 화면이 쓰는 껍데기.
export default async function BrowseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // DB 가 아직 안 올라왔어도 화면은 떠야 한다.
  const sections = await getSections().catch(() => [])

  // 관리자 화면 진입점은 Plex 서버 소유 계정(NUGA)으로 들어왔을 때만 보여준다.
  // 이름으로 맞추지 않는다 — 표시 이름은 관리자가 바꿀 수 있어서 그때 조용히 사라진다.
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)
  const profile = profileId ? await getCurrentProfile(profileId).catch(() => null) : null

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        groups={groupSections(sections)}
        profile={profile}
        showAdminLink={profile?.isPlexAdmin ?? false}
      />
      <main>{children}</main>

      {/* 동기화 시각은 보는 사람에게 쓸모가 없어 관리자 화면으로 옮겼다(AdminNav). */}
      <footer className="border-t border-border px-4 py-8 text-center text-sm md:px-8">
        <a
          href="https://nugabox.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
        >
          <span aria-hidden>©</span>
          <span className="font-logo text-base font-black tracking-tight">NUGABOX</span>
        </a>
      </footer>
    </div>
  )
}
