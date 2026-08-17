'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronDown,
  Home,
  Layers,
  LogOut,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LibrarySection } from '@/lib/library'
import type { Profile } from '@/lib/profiles'
import { ChatPanel } from './chat-panel'
import { HomeOrderModal, type OrderableRow } from './home-order-modal'
import { NoticeBell } from './notice-bell'

// 메뉴 구성은 Plex 의 라이브러리 분류를 그대로 따른다. 우리가 새로 묶지 않는다.
// 순서: 홈 · 검색 → 구분선 → 영화 ▾ · 드라마 ▾ · 애니 ▾ · 예능 · 다큐

export function Navbar({
  groups,
  homeRows,
  profile,
  showAdminLink = false,
}: {
  groups: { group: string; sections: LibrarySection[] }[]
  /** 홈 화면 설정 창이 보여줄 줄 목록. 홈과 같은 기본 차례로 온다 */
  homeRows: OrderableRow[]
  /** 지금 보고 있는 사람. 우측 상단 동그란 버튼이 된다 */
  profile: Profile | null
  /** Plex 서버 소유 계정으로 들어왔을 때만 관리자 진입점을 보여준다 */
  showAdminLink?: boolean
}) {
  const pathname = usePathname()
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [homeSettingsOpen, setHomeSettingsOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const openSections = groups.find((group) => group.group === openGroup)?.sections ?? []

  // 바깥을 누르거나 화면이 바뀌면 열린 메뉴를 닫는다.
  useEffect(() => {
    setOpenGroup(null)
    setProfileOpen(false)
  }, [pathname])
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!navRef.current?.contains(target) && !mobileNavRef.current?.contains(target)) {
        setOpenGroup(null)
      }
      if (!profileRef.current?.contains(target)) setProfileOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenGroup(null)
      setProfileOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // 나가면 프로필 고르는 화면으로 돌아간다. 프로필 쿠키가 곧 관문이라
  // 다시 들어오려면 그 사람의 이메일을 한 번 더 확인하게 된다.
  async function leave() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // 쿠키를 지웠으니 전체 페이지 이동으로 서버가 다시 판단하게 한다.
    window.location.assign('/profile')
  }

  return (
    // pt-[env(...)] 는 앱 셸에서만 값이 생긴다. 웹뷰가 viewport-fit=cover 로 노치
    // 아래까지 그리므로(app/layout.tsx), 이 여백이 없으면 로고와 오른쪽 아이콘들이
    // 상태바에 깔린다. 겹쳐 보이는 것으로 끝나지 않고 iOS 상태바가 탭을 먼저 먹어
    // 채팅·알림 버튼이 아예 안 눌린다. 브라우저에서는 inset 이 0 이라 그대로다.
    <header className="fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)]">
      {/* 뒤로 화면이 비쳐도 메뉴 글씨가 읽히도록 검은 막을 한 겹 깐다. 스크롤해도
          모양이 바뀌지 않는다 — 유리(블러) + 아래 테두리로 바꾸면 상단 바가 화면에서
          잘려 보인다. 막은 상단 바보다 내려와 끝에서 서서히 사라져 경계가 없다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[130%] bg-gradient-to-b from-background via-background/85 to-transparent"
      />

      <div className="relative flex h-16 items-center gap-3 px-4 md:px-8">
        <Link href="/" className="font-logo shrink-0 select-none text-2xl font-black tracking-tight">
          <span className="text-foreground">NU</span>
          <span className="text-primary">PLEX</span>
        </Link>

        <div ref={navRef} className="ml-2 hidden min-w-0 items-center gap-1 lg:flex">
          <NavLink href="/" active={pathname === '/'} icon={Home} label="홈" />
          <NavLink
            href="/search"
            active={pathname === '/search'}
            icon={Search}
            label="검색"
          />

          {/* 홈 · 검색과 라이브러리 분류를 갈라놓는 구분선 */}
          <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-border" />

          {groups.map((group) =>
            group.sections.length === 1 ? (
              <NavLink
                key={group.group}
                href={`/library/${group.sections[0].id}`}
                active={pathname === `/library/${group.sections[0].id}`}
                label={group.group}
              />
            ) : (
              <div key={group.group} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroup((current) => (current === group.group ? null : group.group))
                  }
                  aria-expanded={openGroup === group.group}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    group.sections.some((s) => pathname === `/library/${s.id}`)
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {group.group}
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      openGroup === group.group && 'rotate-180',
                    )}
                  />
                </button>

                {openGroup === group.group ? (
                  <ul className="absolute left-0 top-full z-10 mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-2xl">
                    {group.sections.map((section) => (
                      <li key={section.id}>
                        <Link
                          href={`/library/${section.id}`}
                          className="flex items-center justify-between gap-4 px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
                        >
                          {section.label}
                          <span className="text-xs text-muted-foreground">{section.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ),
          )}

          {/* 시리즈 모음은 Plex 분류가 아니라 우리가 얹은 화면이라 맨 뒤에 둔다 */}
          <NavLink
            href="/collections"
            active={pathname === '/collections'}
            icon={Layers}
            label="시리즈"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/search"
            aria-label="검색"
            className="flex items-center justify-center rounded-full border border-border bg-secondary/60 p-2 text-foreground transition hover:bg-secondary hover:text-primary lg:hidden"
          >
            <Search className="h-5 w-5" />
          </Link>
          <ChatPanel adminSelf={showAdminLink} />
          <NoticeBell />
          {/* 프로필 사진이 곧 메뉴 버튼이다. 관리자 진입점도 이 안에 둔다 —
              상단 줄에 아이콘을 하나 더 놓으면 좁은 화면이 금방 빡빡해진다 */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-label={profile ? `${profile.name} 메뉴` : '프로필 메뉴'}
              aria-expanded={profileOpen}
              className={cn(
                'flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-bold text-muted-foreground transition',
                'ring-1 ring-inset ring-white/10 hover:ring-2 hover:ring-primary',
                profileOpen && 'ring-2 ring-primary',
              )}
            >
              {profile?.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile?.name.slice(0, 1) ?? '?')
              )}
            </button>

            {profileOpen ? (
              /* z-10 이 없으면 아래 분류 줄이 DOM 순서상 뒤라 팝업 위에 겹쳐 찍힌다 */
              <div className="absolute right-0 top-full z-10 mt-2 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-2xl">
                {profile ? (
                  <p className="truncate px-4 py-2 text-sm font-semibold text-foreground">
                    {profile.name}
                  </p>
                ) : null}
                {/* 홈 줄 순서. 홈이 아닌 화면에서도 열 수 있어야 나중에 찾기 쉽다 */}
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    setHomeSettingsOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  홈 화면 설정
                </button>
                {showAdminLink ? (
                  <Link
                    href="/admin/scan"
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-primary transition hover:bg-secondary"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    관리자
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={leave}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  나가기
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 좁은 화면 — 구분만 늘어놓고, 하위 분류는 눌러서 아래로 편다.
          전부 펼쳐두면 줄이 화면 몇 배로 길어져 무엇이 있는지 한눈에 안 들어온다. */}
      <div ref={mobileNavRef} className="relative lg:hidden">
        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto px-4 pb-2">
          <NavLink href="/" active={pathname === '/'} icon={Home} label="홈" />
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          {groups.map((group) =>
            group.sections.length === 1 ? (
              <NavLink
                key={group.group}
                href={`/library/${group.sections[0].id}`}
                active={pathname === `/library/${group.sections[0].id}`}
                label={group.group}
              />
            ) : (
              <button
                key={group.group}
                type="button"
                onClick={() =>
                  setOpenGroup((current) => (current === group.group ? null : group.group))
                }
                aria-expanded={openGroup === group.group}
                className={cn(
                  'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                  openGroup === group.group ||
                    group.sections.some((s) => pathname === `/library/${s.id}`)
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground',
                )}
              >
                {group.group}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    openGroup === group.group && 'rotate-180',
                  )}
                />
              </button>
            ),
          )}
          <NavLink
            href="/collections"
            active={pathname === '/collections'}
            icon={Layers}
            label="시리즈"
          />
        </nav>

        {openSections.length > 1 ? (
          <ul className="grid grid-cols-2 gap-1 border-t border-border bg-popover/95 px-4 py-2 shadow-2xl backdrop-blur-md">
            {openSections.map((section) => (
              <li key={section.id}>
                <Link
                  href={`/library/${section.id}`}
                  onClick={() => setOpenGroup(null)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm transition',
                    pathname === `/library/${section.id}`
                      ? 'bg-primary/15 font-medium text-primary'
                      : 'text-foreground hover:bg-secondary',
                  )}
                >
                  {section.label}
                  <span className="text-xs text-muted-foreground">{section.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 홈 줄 순서 창. 여는 곳이 프로필 메뉴라 상단 바가 들고 있는다 */}
      <HomeOrderModal
        rows={homeRows}
        open={homeSettingsOpen}
        onClose={() => setHomeSettingsOpen(false)}
      />
    </header>
  )
}

function NavLink({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string
  active: boolean
  icon?: typeof Home
  label: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </Link>
  )
}
