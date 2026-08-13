'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Home, Layers, LogOut, Search, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LibrarySection } from '@/lib/library'
import { ChatPanel } from './chat-panel'
import { NoticeBell } from './notice-bell'
import { SectionTitle } from './section-title'

// 메뉴 구성은 Plex 의 라이브러리 분류를 그대로 따른다. 우리가 새로 묶지 않는다.
// 순서: 홈 · 검색 → 구분선 → 영화 ▾ · 드라마 ▾ · 애니 ▾ · 예능 · 다큐

export function Navbar({
  groups,
  showAdminLink = false,
}: {
  groups: { group: string; sections: LibrarySection[] }[]
  /** Plex 서버 소유 계정으로 들어왔을 때만 관리자 진입점을 보여준다 */
  showAdminLink?: boolean
}) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 바깥을 누르거나 화면이 바뀌면 열린 메뉴를 닫는다.
  useEffect(() => setOpenGroup(null), [pathname])
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // 쿠키를 지웠으니 전체 페이지 이동으로 서버가 다시 판단하게 한다.
    window.location.assign('/login')
  }

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-border bg-background/85 backdrop-blur-md'
          : 'bg-gradient-to-b from-background/90 to-transparent',
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
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
                  <ul className="absolute left-0 top-full mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-2xl">
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
          <ChatPanel />
          <NoticeBell />
          {showAdminLink ? (
            <Link
              href="/admin/notices"
              aria-label="관리자"
              title="관리자"
              className="flex items-center justify-center rounded-full border border-primary/40 bg-primary/10 p-2 text-primary transition hover:bg-primary/20"
            >
              <ShieldCheck className="h-5 w-5" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={logout}
            aria-label="나가기"
            title="나가기"
            className="flex items-center justify-center rounded-full border border-border bg-secondary/60 p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 좁은 화면 — 분류를 가로 스크롤로 편다 */}
      <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        <NavLink href="/" active={pathname === '/'} icon={Home} label="홈" />
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
        {groups.flatMap((group) =>
          group.sections.map((section) => (
            <NavLink
              key={section.id}
              href={`/library/${section.id}`}
              active={pathname === `/library/${section.id}`}
              label={<SectionTitle title={section.title} />}
            />
          )),
        )}
        <NavLink
          href="/collections"
          active={pathname === '/collections'}
          icon={Layers}
          label="시리즈"
        />
      </nav>
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
