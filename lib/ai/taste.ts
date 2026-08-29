import 'server-only'
import { query, queryOne } from '@/lib/db'
import {
  getItemsByKeys,
  getTasteCandidates,
  getWatchStats,
  getWatchedItems,
  type LibraryItem,
} from '@/lib/library'
import { formatDuration } from '@/lib/format'
import { AiUnavailableError, chatJson, getModel, hasApiKey } from './deepseek'

// "내 공간" 맨 위에 뜨는 취향 카드 — 무엇을 자주 보는 사람인지, 그래서 무엇을 권하는지.
//
// 두 가지를 지켜야 한다.
//   · **추천은 우리 라이브러리 안에서만.** 후보를 DB 에서 먼저 추려 그 목록만 넘기고,
//     답으로 온 키가 그 안에 있는지 다시 확인한다. 확인 없이 믿으면 없는 작품을 권한다.
//   · **화면 그리는 길에서 만들지 않는다.** 한 번에 30초~1분이 걸린다(database/0013_ai.sql).
//     화면은 담아둔 것을 즉시 그리고, 없을 때만 뜬 뒤에 채운다.

/** 이만큼은 봐야 취향이랄 게 생긴다. 그 아래에서는 부르지 않는다 — 토큰만 쓴다 */
const MIN_VIEWS = 5
/** 담아둔 뒤 이만큼 더 봤으면 다시 만든다 */
const RESTALE_VIEWS = 10

export interface Taste {
  summary: string
  tags: string[]
  picks: { item: LibraryItem; reason: string }[]
  model: string
  createdAt: Date
}

/** 아직 만들 만큼 안 봤을 때. 화면이 "조금 더 보면 알려준다" 로 안내한다 */
export class NotEnoughHistoryError extends Error {}

interface TasteRow {
  model: string
  summary: string
  tags: string[]
  picks: { ratingKey: string; reason: string }[]
  view_count: number
  created_at: Date
}

async function toTaste(row: TasteRow): Promise<Taste> {
  const items = await getItemsByKeys(row.picks.map((pick) => pick.ratingKey))
  const byKey = new Map(items.map((item) => [item.ratingKey, item]))

  return {
    summary: row.summary,
    tags: row.tags,
    // 담아둔 뒤 Plex 에서 빠진 작품은 조용히 뺀다.
    picks: row.picks
      .map((pick) => ({ item: byKey.get(pick.ratingKey), reason: pick.reason }))
      .filter((pick): pick is { item: LibraryItem; reason: string } => Boolean(pick.item)),
    model: row.model,
    createdAt: row.created_at,
  }
}

/** 담아둔 것. 없거나 낡았으면 null 이다 — 화면이 그때만 새로 만들자고 부른다. */
export async function getCachedTaste(profileId: number): Promise<Taste | null> {
  const row = await queryOne<TasteRow>(
    `SELECT model, summary, tags, picks, view_count, created_at
       FROM profile_taste WHERE profile_id = $1`,
    [profileId],
  )
  if (!row) return null

  // 관리자가 모델을 바꿨으면 그 모델로 다시 만든다.
  if (row.model !== (await getModel())) return null

  const stats = await getWatchStats(profileId)
  if (stats.views - row.view_count >= RESTALE_VIEWS) return null

  return toTaste(row)
}

interface AiAnswer {
  summary?: unknown
  tags?: unknown
  picks?: unknown
}

/** 딥시크를 실제로 불러 새로 만든다. 담아두고 돌려준다. */
export async function generateTaste(profileId: number): Promise<Taste> {
  if (!hasApiKey()) throw new AiUnavailableError('DEEPSEEK_API_KEY 가 설정되지 않았습니다.')

  const [stats, watched, candidates] = await Promise.all([
    getWatchStats(profileId),
    getWatchedItems(profileId, 40),
    getTasteCandidates(profileId, 40),
  ])

  if (stats.views < MIN_VIEWS) {
    throw new NotEnoughHistoryError('아직 시청 기록이 적습니다.')
  }

  const watchedLines = watched
    .map((item) => {
      const genres = item.genres.slice(0, 3).join('/') || '장르 없음'
      const kind = item.type === 'show' ? `시리즈·${genres}, ${item.viewCount}편` : `영화·${genres}`
      return `${item.title}(${kind})`
    })
    .join(' · ')

  const genreLine = stats.genres
    .map((genre) => `${genre.name} ${genre.count}`)
    .join(' · ')

  const candidateLines = candidates
    .map((candidate) => {
      const genres = candidate.genres.slice(0, 3).join('/') || '장르 없음'
      const kind = candidate.type === 'show' ? '시리즈' : '영화'
      return `${candidate.ratingKey} ${candidate.title}(${kind}·${genres}${
        candidate.year ? `·${candidate.year}` : ''
      })`
    })
    .join('\n')

  const answer = await chatJson<AiAnswer>({
    purpose: 'taste',
    system:
      '너는 개인 미디어 서버의 취향 분석기다. ' +
      '추천은 오직 주어진 후보 목록 안에서만 한다 — 목록에 없는 작품은 절대 언급하지 않는다. ' +
      '한국어로 쓰고, 문장은 짧고 담백하게 한다. 과장하거나 광고처럼 쓰지 않는다. ' +
      '가운데점(·)은 앞뒤에 공백을 둔다.',
    user: [
      '[내가 본 작품]',
      watchedLines,
      '',
      `[장르 분포(작품 수)] ${genreLine || '없음'}`,
      `[본 편수] ${stats.views}편 · [본 작품] ${stats.titles}편 · [총 시청시간] ${
        formatDuration(stats.totalMs) ?? '알 수 없음'
      }`,
      '',
      '[추천 후보 — 이 안에서만 고른다. 줄 맨 앞 숫자가 key 다]',
      candidateLines,
      '',
      'JSON 으로만 답한다:',
      '{"summary": "이 사람의 취향 2~3문장", "tags": ["짧은 성격 태그 3~5개"],',
      ' "picks": [{"key": "후보 번호", "reason": "왜 이 사람에게 맞는지 한 문장"}]}',
      'picks 는 4개. reason 에는 이 사람이 본 작품을 근거로 든다.',
    ].join('\n'),
  })

  const summary = typeof answer.summary === 'string' ? answer.summary.trim() : ''
  if (!summary) throw new AiUnavailableError('요약이 비어 있습니다.')

  const tags = Array.isArray(answer.tags)
    ? answer.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 5)
    : []

  // 후보에 없는 키는 버린다. 지어낸 추천이 화면에 나가지 않게 하는 마지막 문이다.
  //
  // 같은 작품이 두 번 오는 것도 여기서 막는다 — 후보가 요청한 개수보다 적으면 모델이
  // 수를 맞추려고 하나를 다시 쓴다(후보 3개에 4개를 시켰더니 실제로 그랬다).
  const allowed = new Set(candidates.map((candidate) => candidate.ratingKey))
  const seen = new Set<string>()
  const picks = (Array.isArray(answer.picks) ? answer.picks : [])
    .map((pick) => pick as { key?: unknown; reason?: unknown })
    .map((pick) => ({
      ratingKey: String(pick.key ?? ''),
      reason: typeof pick.reason === 'string' ? pick.reason.trim() : '',
    }))
    .filter((pick) => {
      if (!allowed.has(pick.ratingKey) || seen.has(pick.ratingKey)) return false
      seen.add(pick.ratingKey)
      return true
    })
    .slice(0, 4)

  await query(
    `INSERT INTO profile_taste (profile_id, model, summary, tags, picks, view_count, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
       ON CONFLICT (profile_id) DO UPDATE
          SET model = excluded.model, summary = excluded.summary, tags = excluded.tags,
              picks = excluded.picks, view_count = excluded.view_count,
              created_at = excluded.created_at`,
    [profileId, await getModel(), summary, tags, JSON.stringify(picks), stats.views],
  )

  return toTaste({
    model: await getModel(),
    summary,
    tags,
    picks,
    view_count: stats.views,
    created_at: new Date(),
  })
}
