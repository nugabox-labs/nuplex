import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getLastSync } from '@/lib/library'
import { formatRelativeTime } from '@/lib/format'

const TABS = [
  // 스캔이 맨 앞이다. 관리자 화면에 들어오는 가장 잦은 용건이라 첫 화면으로 둔다.
  { key: 'scan', href: '/admin/scan', label: '스캔' },
  { key: 'notices', href: '/admin/notices', label: '알림' },
  { key: 'featured', href: '/admin/featured', label: '연재' },
  { key: 'profiles', href: '/admin/profiles', label: '프로필' },
]

export async function AdminNav({ current }: { current: string }) {
  // 동기화 시각은 관리자만 볼 자리다. DB 가 아직 없어도 화면은 떠야 한다.
  const lastSync = await getLastSync().catch(() => null)

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">
          {lastSync
            ? `마지막 동기화 ${formatRelativeTime(lastSync.finishedAt)}${
                lastSync.status === 'failed' ? ' · 실패' : ''
              }`
            : '아직 동기화된 적이 없습니다.'}
        </span>
        <Link href="/" className="text-sm text-muted-foreground transition hover:text-foreground">
          사이트로 →
        </Link>
      </div>
    </div>
  )
}
