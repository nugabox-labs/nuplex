import { query, queryOne } from '@/lib/db'
import { formatDuration } from '@/lib/format'
import {
  getGenrePicks,
  getTasteCandidates,
  getWatchStats,
  getWatchedTitles,
  type GenrePicks,
} from '@/lib/watch'
import { AiUnavailableError, chatJson, getModel, hasApiKey } from './deepseek'

// 취향 분석 — 무엇을 좋아하는 사람인지 한 문단으로 쓰고, 볼 만한 것을 골라 담아둔다.
//
// **이 모듈에는 'server-only' 를 걸지 않는다.** 만드는 일은 sync 워커가 한다
// (sync/taste.ts). 워커는 Next.js 없이 도는 순수 Node 라 server-only 모듈을 import
// 하면 즉시 죽는다(AGENTS.md §4). 화면은 담긴 것을 읽기만 한다(lib/library.ts 의 getTaste).
//
// 지켜야 할 것 둘.
//   · **추천은 우리 라이브러리 안에서만.** 후보를 DB 에서 먼저 추려 그 목록만 넘기고,
//     답으로 온 키가 그 안에 있는지 다시 확인한다. 확인 없이 믿으면 없는 작품을 권한다.
//   · **화면 그리는 길에서 만들지 않는다.** 한 번에 30초~1분이 걸린다.

/** 한 편만 봤어도 그 장르에서 시작한다. 기록이 0이면 부르지 않는다 — 쓸 재료가 없다 */
const MIN_VIEWS = 1
/** 홈 줄 하나를 채울 만큼 고르게 한다 */
const PICK_COUNT = 10
/** 장르 줄을 몇 개까지 만들지. 많이 본 장르 순 */
const GENRE_ROW_COUNT = 5
/** 장르 줄 하나에 담을 작품 수 */
const PER_GENRE = 15

/**
 * 프롬프트 · 저장 형식의 판 번호. **말투나 저장 모양을 고치면 반드시 올린다.**
 * 담아둔 것이 이 번호와 다르면 낡은 것으로 보고 다시 만든다
 * (database/0015_taste_prompt_version.sql).
 */
export const TASTE_PROMPT_VERSION = 2

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

export interface TasteResult {
  summary: string
  tags: string[]
  picks: string[]
  genrePicks: GenrePicks[]
}

/** 아직 아무것도 안 봤을 때. 워커는 이 프로필을 건너뛴다 */
export class NotEnoughHistoryError extends Error {}

/**
 * 이 프로필의 취향을 새로 분석해 담아둔다.
 *
 * 부르는 곳은 sync 워커 하나뿐이다. 시청 기록이 갱신된 프로필만 골라서 부른다.
 */
export async function generateTaste(profileId: number): Promise<TasteResult> {
  if (!hasApiKey()) throw new AiUnavailableError('DEEPSEEK_API_KEY 가 설정되지 않았습니다.')

  const [name, stats, watched, candidates] = await Promise.all([
    getProfileName(profileId),
    getWatchStats(profileId),
    getWatchedTitles(profileId, 40),
    // 10편을 고르게 하므로 후보도 넉넉히 준다.
    getTasteCandidates(profileId, 60),
  ])

  if (stats.views < MIN_VIEWS) {
    throw new NotEnoughHistoryError('아직 시청 기록이 없습니다.')
  }

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

  // 장르별 줄은 SQL 이 만든다 — 이유는 lib/watch.ts 의 getGenrePicks 주석에 있다.
  const genrePicks = await getGenrePicks(
    profileId,
    stats.genres.slice(0, GENRE_ROW_COUNT).map((genre) => genre.name),
    PER_GENRE,
  )

  const model = await getModel()

  await query(
    `INSERT INTO profile_taste
       (profile_id, model, summary, tags, picks, genre_picks, view_count, prompt_version, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, now())
       ON CONFLICT (profile_id) DO UPDATE
          SET model = excluded.model, summary = excluded.summary, tags = excluded.tags,
              picks = excluded.picks, genre_picks = excluded.genre_picks,
              view_count = excluded.view_count, prompt_version = excluded.prompt_version,
              created_at = excluded.created_at`,
    [
      profileId,
      model,
      summary,
      tags,
      JSON.stringify(picks),
      JSON.stringify(genrePicks),
      stats.views,
      TASTE_PROMPT_VERSION,
    ],
  )

  return { summary, tags, picks, genrePicks }
}

/** 표시 이름. lib/profiles.ts 는 'server-only' 라 워커가 못 쓴다 — 규칙만 같게 둔다. */
async function getProfileName(profileId: number): Promise<string> {
  const row = await queryOne<{ name: string }>(
    `SELECT coalesce(
              nullif(btrim(p.display_name), ''), nullif(btrim(a.name), ''),
              nullif(btrim(a.username), ''), '회원'
            ) AS name
       FROM profile p
       LEFT JOIN plex_account a ON a.id = p.plex_account_id
      WHERE p.id = $1`,
    [profileId],
  )
  return row?.name ?? '회원'
}
