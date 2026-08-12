import type { LibraryItem } from '@/lib/library'

// 화면에 쓰는 한국어 표기. 가운데점은 항상 앞뒤에 공백을 둔다 — AGENTS.md §2

export function formatDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 카드 · 배너에 붙는 분량 표기. 영화는 러닝타임, 시리즈는 시즌 수. */
export function formatLength(item: LibraryItem): string | null {
  if (item.type === 'movie') return formatDuration(item.durationMs)
  if (item.childCount && item.childCount > 0) return `시즌 ${item.childCount}개`
  if (item.leafCount && item.leafCount > 0) return `에피소드 ${item.leafCount}개`
  return null
}

export function formatRating(item: LibraryItem): string | null {
  const rating = item.audienceRating ?? item.criticRating
  return rating ? rating.toFixed(1) : null
}

export function typeLabel(type: 'movie' | 'show'): string {
  return type === 'show' ? '시리즈' : '영화'
}

/** 메타 줄을 만들 때 빈 값을 걸러 가운데점으로 잇는다. */
export function metaLine(...parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join(' · ')
}

const RELATIVE_UNITS: [number, string][] = [
  [60, '초'],
  [60, '분'],
  [24, '시간'],
]

/** "3분 전" 같은 표기. 하루가 넘으면 날짜로 보여준다. */
export function formatRelativeTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  let amount = (Date.now() - date.getTime()) / 1000

  for (const [step, unit] of RELATIVE_UNITS) {
    if (amount < step) return `${Math.max(0, Math.floor(amount))}${unit} 전`
    amount /= step
  }
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
}
