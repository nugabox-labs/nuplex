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
import { getCurrentProfile } from '@/lib/profiles'
import { AiUnavailableError, chatJson, getModel, hasApiKey } from './deepseek'

// "내 취향" 맨 위에 뜨는 취향 카드 — 무엇을 자주 보는 사람인지, 그래서 무엇을 권하는지.
// 고른 작품은 홈의 "○○님이 볼 만한 작품" 줄이 된다.
//
// 두 가지를 지켜야 한다.
//   · **추천은 우리 라이브러리 안에서만.** 후보를 DB 에서 먼저 추려 그 목록만 넘기고,
//     답으로 온 키가 그 안에 있는지 다시 확인한다. 확인 없이 믿으면 없는 작품을 권한다.
//   · **화면 그리는 길에서 만들지 않는다.** 한 번에 30초~1분이 걸린다(database/0013_ai.sql).
//     화면은 담아둔 것을 즉시 그리고, 없을 때만 뜬 뒤에 채운다.

/** 한 편만 봤어도 그 장르에서 시작한다. 기록이 0이면 부르지 않는다 — 쓸 재료가 없다 */
const MIN_VIEWS = 1
/** 담아둔 뒤 이만큼 더 봤으면 다시 만든다 */
const RESTALE_VIEWS = 10
/** 홈 줄 하나를 채울 만큼 고르게 한다 */
const PICK_COUNT = 10
/**
 * 프롬프트 · 저장 형식의 판 번호. **말투나 picks 모양을 고치면 반드시 올린다.**
 * 담아둔 것이 이 번호와 다르면 낡은 것으로 보고 다시 만든다
 * (database/0015_taste_prompt_version.sql).
 */
const PROMPT_VERSION = 1

export interface Taste {
  summary: string
  tags: string[]
  /** 홈 줄에 그대로 쓰는 작품들. 고른 차례를 지킨다 */
  picks: LibraryItem[]
  model: string
  createdAt: Date
}

/** 아직 아무것도 안 봤을 때. 화면은 이때 카드도 줄도 만들지 않는다 */
export class NotEnoughHistoryError extends Error {}

interface TasteRow {
  model: string
  summary: string
  tags: string[]
  /** rating_key 배열 */
  picks: string[]
  view_count: number
  prompt_version: number
  created_at: Date
}

async function toTaste(row: TasteRow): Promise<Taste> {
  return {
    summary: row.summary,
    tags: row.tags,
    // 담아둔 뒤 Plex 에서 빠진 작품은 getItemsByKeys 가 조용히 뺀다.
    picks: await getItemsByKeys(row.picks),
    model: row.model,
    createdAt: row.created_at,
  }
}

/** 담아둔 것. 없거나 낡았으면 null 이다 — 화면이 그때만 새로 만들자고 부른다. */
export async function getCachedTaste(profileId: number): Promise<Taste | null> {
  const row = await queryOne<TasteRow>(
    `SELECT model, summary, tags, picks, view_count, prompt_version, created_at
       FROM profile_taste WHERE profile_id = $1`,
    [profileId],
  )
  if (!row) return null

  // 말투나 저장 형식이 바뀐 뒤에 담긴 것이 아니면 버린다.
  if (row.prompt_version !== PROMPT_VERSION) return null
  // 관리자가 모델을 바꿨으면 그 모델로 다시 만든다.
  if (row.model !== (await getModel())) return null

  const stats = await getWatchStats(profileId)
  if (stats.views - row.view_count >= RESTALE_VIEWS) return null

  return toTaste(row)
}

/**
 * 가운데점 앞뒤에 공백을 둔다 — AGENTS.md §2 의 표기 규칙이다.
 *
 * 프롬프트로도 시키지만 모델은 자주 붙여 쓴다. 화면에 그대로 나가는 문장이라
 * 부탁에 맡기지 않고 코드에서 못 박는다.
 */
function spaceMiddleDots(text: string): string {
  return text.replace(/\s*·\s*/g, ' · ')
}

interface AiAnswer {
  summary?: unknown
  tags?: unknown
  picks?: unknown
}

/** 딥시크를 실제로 불러 새로 만든다. 담아두고 돌려준다. */
export async function generateTaste(profileId: number): Promise<Taste> {
  if (!hasApiKey()) throw new AiUnavailableError('DEEPSEEK_API_KEY 가 설정되지 않았습니다.')

  const [profile, stats, watched, candidates] = await Promise.all([
    getCurrentProfile(profileId),
    getWatchStats(profileId),
    getWatchedItems(profileId, 40),
    // 10편을 고르게 하므로 후보도 넉넉히 준다.
    getTasteCandidates(profileId, 60),
  ])

  if (stats.views < MIN_VIEWS) {
    throw new NotEnoughHistoryError('아직 시청 기록이 없습니다.')
  }

  const name = profile?.name ?? '회원'

  const watchedLines = watched
    .map((item) => {
      const genres = item.genres.slice(0, 3).join('/') || '장르 없음'
      const kind = item.type === 'show' ? `시리즈·${genres}, ${item.viewCount}편` : `영화·${genres}`
      return `${item.title}(${kind})`
    })
    .join(' · ')

  const genreLine = stats.genres.map((genre) => `${genre.name} ${genre.count}`).join(' · ')

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
      'summary 는 친근한 말동무처럼 쓴다. 반드시 "<이름>님!" 으로 시작하고, ' +
      '"~보고 계시네요!" · "~즐기시는군요" 같은 다정한 해요체로 이어가며 ' +
      '이모지를 한두 개 섞는다. 분석 보고서처럼 딱딱하게 쓰지 않는다. ' +
      // 추천은 이 문장과 다른 화면(홈 줄)에 나온다. 여기서 "골라봤어요" 라고 하면
      // 정작 그 화면에는 고른 것이 없어 말이 뜬다.
      'summary 에서는 취향 이야기만 한다 — 고른 작품이나 추천을 입에 담지 않는다. ' +
      '가운데점(·)은 반드시 앞뒤에 공백을 둔다.',
    user: [
      `[보는 사람] ${name}`,
      '',
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
      '{"summary": "2~3문장", "tags": ["짧은 장르 · 성격 태그 3~5개"], "picks": ["후보 번호"]}',
      `picks 는 서로 다른 ${PICK_COUNT}개. 이 사람이 본 것과 결이 가까운 순으로 담는다.`,
      `summary 예시 — "${name}님! 스릴러 · 범죄물을 두루 보고 계시네요! 어둡고 긴장감 있는 이야기를 주로 즐기시는군요 😄"`,
    ].join('\n'),
  })

  const written = typeof answer.summary === 'string' ? spaceMiddleDots(answer.summary.trim()) : ''
  if (!written) throw new AiUnavailableError('요약이 비어 있습니다.')

  // 이름으로 시작하는 것은 부탁이 아니라 규칙이다. 모델이 빠뜨리면 여기서 붙인다.
  const summary = written.startsWith(name) ? written : `${name}님! ${written}`

  const tags = Array.isArray(answer.tags)
    ? answer.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => spaceMiddleDots(tag.trim()))
        .slice(0, 5)
    : []

  // 후보에 없는 키는 버린다. 지어낸 추천이 화면에 나가지 않게 하는 마지막 문이다.
  //
  // 같은 작품이 두 번 오는 것도 여기서 막는다 — 후보가 요청한 개수보다 적으면 모델이
  // 수를 맞추려고 하나를 다시 쓴다(후보 3개에 4개를 시켰더니 실제로 그랬다).
  const allowed = new Set(candidates.map((candidate) => candidate.ratingKey))
  const seen = new Set<string>()
  const picks = (Array.isArray(answer.picks) ? answer.picks : [])
    .map((pick) => String(pick ?? ''))
    .filter((key) => {
      if (!allowed.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, PICK_COUNT)

  // 모델이 덜 골랐으면 후보 차례대로 채운다. 후보는 이미 취향 순으로 정렬돼 있어
  // 홈 줄이 서너 칸만 덩그러니 놓이는 것보다 낫다.
  for (const candidate of candidates) {
    if (picks.length >= PICK_COUNT) break
    if (seen.has(candidate.ratingKey)) continue
    seen.add(candidate.ratingKey)
    picks.push(candidate.ratingKey)
  }

  const model = await getModel()

  await query(
    `INSERT INTO profile_taste
       (profile_id, model, summary, tags, picks, view_count, prompt_version, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now())
       ON CONFLICT (profile_id) DO UPDATE
          SET model = excluded.model, summary = excluded.summary, tags = excluded.tags,
              picks = excluded.picks, view_count = excluded.view_count,
              prompt_version = excluded.prompt_version, created_at = excluded.created_at`,
    [profileId, model, summary, tags, JSON.stringify(picks), stats.views, PROMPT_VERSION],
  )

  return toTaste({
    model,
    summary,
    tags,
    picks,
    view_count: stats.views,
    prompt_version: PROMPT_VERSION,
    created_at: new Date(),
  })
}
