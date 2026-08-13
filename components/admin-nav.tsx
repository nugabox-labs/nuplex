import Link from 'next/link'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'notices', href: '/admin/notices', label: '알림' },
  { key: 'featured', href: '/admin/featured', label: '연재' },
  { key: 'profiles', href: '/admin/profiles', label: '프로필' },
]

export function AdminNav({ current }: { current: string }) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab.key === current
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Link href="/" className="text-sm text-muted-foreground transition hover:text-foreground">
        사이트로 →
      </Link>
    </div>
  )
}
