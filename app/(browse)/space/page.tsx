import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Clock, Eye, Film, Tv } from 'lucide-react'
import { TasteCard, type TasteView } from '@/components/taste-card'
import { WatchedList } from '@/components/watched-list'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { getCachedTaste } from '@/lib/ai/taste'
import { formatDuration, formatRelativeTime } from '@/lib/format'
import { getWatchStats, getWatchedItems } from '@/lib/library'
import { getCurrentProfile } from '@/lib/profiles'

export const metadata: Metadata = { title: '내 취향' }
export const dynamic = 'force-dynamic'

/** 목록에 몇 개까지 늘어놓을지. 넘치면 아래에 안내를 붙인다 */
const LIST_LIMIT = 200
/** 장르 차트에 몇 개까지 세울지 */
const GENRE_TOP = 5

export default async function SpacePage() {
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)

  if (!profileId) {
    return (
      <div className="page-top px-4 pb-20 md:px-8">
        <Empty title="프로필이 없습니다">프로필을 고른 뒤에 만들어지는 화면입니다.</Empty>
      </div>
    )
  }

  // 취향 카드는 담아둔 것만 서버에서 읽는다. 새로 만드는 일(30초~1분)은 화면이 뜬 뒤
  // 클라이언트가 /api/space/taste 로 맡는다 — 여기서 기다리면 화면이 통째로 늦는다.
  const [profile, stats, watched, cachedTaste] = await Promise.all([
    getCurrentProfile(profileId),
    getWatchStats(profileId),
    getWatchedItems(profileId, LIST_LIMIT),
    getCachedTaste(profileId).catch(() => null),
  ])

  const initialTaste: TasteView | null = cachedTaste
    ? { summary: cachedTaste.summary, tags: cachedTaste.tags }
    : null

  const topGenres = stats.genres.slice(0, GENRE_TOP)

  return (
    <div className="page-top px-4 pb-20 md:px-8">
      <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
        내 취향
        {profile ? (
          <span className="ml-2 text-base font-normal text-muted-foreground">{profile.name}</span>
        ) : null}
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        지금까지 본 작품과 취향을 모아 둔 곳입니다.
      </p>

      {stats.views === 0 ? (
        <Empty title="아직 본 작품이 없습니다">
          Plex 에서 무언가를 보고 나면 여기에 쌓입니다. 시청 기록은 30분마다 동기화됩니다.
        </Empty>
      ) : (
        <div className="space-y-12">
          <TasteCard initial={initialTaste} />

          {/* --- 내 시청 기록 — 왼쪽에 숫자 넷, 오른쪽에 장르 차트 --- */}
          <section>
            <h2 className="mb-4 border-b border-border pb-2 text-lg font-bold text-foreground md:text-xl">
              내 시청 기록
            </h2>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  icon={<Film className="h-4 w-4" />}
                  label="본 작품"
                  value={`${stats.titles.toLocaleString('ko-KR')}편`}
                  note={`영화 ${stats.movieTitles.toLocaleString(
                    'ko-KR',
                  )} · 시리즈 ${stats.showTitles.toLocaleString('ko-KR')}`}
                />
                <Stat
                  icon={<Tv className="h-4 w-4" />}
                  label="본 편수"
                  value={`${stats.views.toLocaleString('ko-KR')}편`}
                  note={`에피소드 ${stats.episodes.toLocaleString('ko-KR')}`}
                />
                <Stat
                  icon={<Clock className="h-4 w-4" />}
                  label="총 시청시간"
                  value={formatDuration(stats.totalMs) ?? '알 수 없음'}
                  note={
                    stats.firstViewedAt
                      ? `${new Date(stats.firstViewedAt).toLocaleDateString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                        })}부터`
                      : undefined
                  }
                />
                <Stat
                  icon={<Eye className="h-4 w-4" />}
                  label="최근 30일"
                  value={`${stats.recentViews.toLocaleString('ko-KR')}편`}
                  note={topGenres[0] ? `주로 ${topGenres[0].name}` : undefined}
                />
              </div>

              {topGenres.length > 0 ? (
                <div className="rounded-xl border border-border bg-card/60 p-5">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    많이 본 장르 TOP {topGenres.length}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      작품 수 기준
                    </span>
                  </h3>
                  <ul className="space-y-3">
                    {topGenres.map((genre) => (
                      <li key={genre.name} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 truncate text-sm text-muted-foreground">
                          {genre.name}
                        </span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{
                              // 1등을 100% 로 두고 나머지를 그에 견준다. 절대 비율로 그리면
                              // 장르가 잘게 나뉜 라이브러리에서 막대가 전부 실오라기가 된다.
                              width: `${Math.max(4, (genre.count / topGenres[0].count) * 100)}%`,
                            }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                          {genre.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          {/* --- 내가 본 작품 — 장르 탭 · 편집(감추기)은 클라이언트가 맡는다 --- */}
          <div>
            <WatchedList
              items={watched.map((item) => ({
                ...item,
                // 카드 아래 한 줄은 연도 · 장르 대신 "얼마나 · 언제 봤는지" 로 바꾼다
                badge:
                  item.type === 'show'
                    ? `${item.viewCount}편 · ${formatRelativeTime(item.lastViewedAt)}`
                    : formatRelativeTime(item.lastViewedAt),
              }))}
            />

            {watched.length >= LIST_LIMIT ? (
              <p className="mt-8 text-center text-sm text-muted-foreground">
                최근 본 {LIST_LIMIT.toLocaleString('ko-KR')}편까지만 보여주고 있습니다.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-foreground md:text-2xl">{value}</p>
      {note ? <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
