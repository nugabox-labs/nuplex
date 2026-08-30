import { query, queryOne } from '@/lib/db'

// 시청 기록에서 뽑아내는 것들 — 통계 · 취향 후보 · 장르별 추천.
//
// **이 모듈에는 'server-only' 를 걸지 않는다.** sync 워커가 취향 분석을 미리 돌리는데,
// 워커는 Next.js 없이 도는 순수 Node 라 server-only 모듈을 import 하면 즉시 죽는다
// (AGENTS.md §4). 화면과 워커가 같이 쓰는 조회는 전부 여기 둔다.
//
// watch_history 는 Plex 사본이라 우리 라이브러리에서 이미 빠진 것(제외 섹션 · 지워진 작품)의
// 기록도 그대로 들어온다. 화면에 안 보이는 것을 숫자에만 넣으면 합이 안 맞아 보이므로,
// 아래 조회는 전부 **지금 라이브러리에 남아 있는 것**만 센다.

/**
 * "이 프로필이 본 작품과 그 편수" 를 만드는 조각. 에피소드는 그 시리즈로,
 * 영화는 그 자신으로 접는다 — 17,903화를 한 줄씩 늘어놓으면 목록이 아니라 로그가 된다.
 *
 * 사람이 감춘 작품은 여기서 빠진다(database/0014_hidden_watched.sql).
 * `$1` 은 profile.id 다. 화면용 목록(lib/library.ts)도 이 조각을 쓴다.
 */
export const WATCHED_GROUPED_SQL = `
  WITH mine AS (
    SELECT coalesce(h.show_rating_key, h.rating_key) AS item_key, h.viewed_at
      FROM watch_history h
     WHERE h.plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
  ),
  grouped AS (
    SELECT item_key, count(*) AS view_count, max(viewed_at) AS last_viewed_at
      FROM mine
     WHERE item_key <> ALL(
             coalesce((SELECT hidden_watched_items FROM profile WHERE id = $1), '{}')
           )
     GROUP BY item_key
  )
`

/**
 * 이 프로필에 시청 기록이 하나라도 있는가.
 *
 * 홈이 추천 줄을 걸지 말지 정할 때만 쓴다 — 기록이 없으면 줄을 아예 만들지 않으므로
 * 통계 전체를 세는 것보다 이 한 줄이 싸다.
 */
export async function hasWatchHistory(profileId: number): Promise<boolean> {
  const row = await queryOne<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM watch_history
        WHERE plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
     ) AS found`,
    [profileId],
  )
  return row?.found ?? false
}

export interface WatchStats {
  /** 본 작품 수. 시리즈는 몇 화를 봤든 하나로 센다 */
  titles: number
  /** 그중 영화 · 시리즈. 같은 것을 다시 봐도 하나다 */
  movieTitles: number
  showTitles: number
  /** 본 편수. 에피소드 + 영화. 다시 본 것도 센다 */
  views: number
  episodes: number
  /** 최근 30일 편수 */
  recentViews: number
  /** 본 것들의 러닝타임 합 */
  totalMs: number
  firstViewedAt: Date | null
  /** 많이 본 장르. 작품 수 기준 — 100화짜리 드라마 하나가 장르를 다 먹지 않게 한다 */
  genres: { name: string; count: number }[]
}

export async function getWatchStats(profileId: number): Promise<WatchStats> {
  const [totals, genres] = await Promise.all([
    queryOne<{
      titles: string
      movie_titles: string
      show_titles: string
      views: string
      episodes: string
      recent_views: string
      total_ms: string
      first_viewed_at: Date | null
    }>(
      `WITH mine AS (
         SELECT h.type, h.viewed_at,
                coalesce(h.show_rating_key, h.rating_key) AS item_key,
                coalesce(e.duration_ms, m.duration_ms) AS duration_ms
           FROM watch_history h
           LEFT JOIN episode e
             ON h.type = 'episode' AND e.rating_key = h.rating_key AND e.deleted_at IS NULL
           LEFT JOIN media_item m
             ON h.type = 'movie' AND m.rating_key = h.rating_key AND m.deleted_at IS NULL
          WHERE h.plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
            -- 둘 중 하나에 붙지 않았다면 라이브러리에 없는 것이다
            AND (e.rating_key IS NOT NULL OR m.rating_key IS NOT NULL)
       )
       SELECT count(DISTINCT item_key) AS titles,
              count(DISTINCT item_key) FILTER (WHERE type = 'movie') AS movie_titles,
              count(DISTINCT item_key) FILTER (WHERE type = 'episode') AS show_titles,
              count(*) AS views,
              count(*) FILTER (WHERE type = 'episode') AS episodes,
              count(*) FILTER (WHERE viewed_at >= now() - interval '30 days') AS recent_views,
              coalesce(sum(duration_ms), 0) AS total_ms,
              min(viewed_at) AS first_viewed_at
         FROM mine`,
      [profileId],
    ),
    query<{ name: string; count: number }>(
      `SELECT g.name, count(DISTINCT mi.rating_key)::int AS count
         FROM watch_history h
         JOIN media_item mi
           ON mi.rating_key = coalesce(h.show_rating_key, h.rating_key)
          AND mi.deleted_at IS NULL
         JOIN media_item_genre mg ON mg.rating_key = mi.rating_key
         JOIN genre g ON g.id = mg.genre_id
        WHERE h.plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
        GROUP BY g.name
        ORDER BY count DESC, g.name
        LIMIT 10`,
      [profileId],
    ),
  ])

  return {
    titles: Number(totals?.titles ?? 0),
    movieTitles: Number(totals?.movie_titles ?? 0),
    showTitles: Number(totals?.show_titles ?? 0),
    views: Number(totals?.views ?? 0),
    episodes: Number(totals?.episodes ?? 0),
    recentViews: Number(totals?.recent_views ?? 0),
    totalMs: Number(totals?.total_ms ?? 0),
    firstViewedAt: totals?.first_viewed_at ?? null,
    genres,
  }
}

/** 프롬프트에 넣을 만큼만 줄인 "내가 본 작품" 한 줄. 포스터 · 줄거리는 보낼 이유가 없다. */
export interface WatchedTitle {
  title: string
  type: 'movie' | 'show'
  genres: string[]
  viewCount: number
}

/** 최근 본 순. 취향 프롬프트를 만들 때 쓴다. */
export async function getWatchedTitles(profileId: number, limit = 40): Promise<WatchedTitle[]> {
  const rows = await query<{
    title: string
    type: 'movie' | 'show'
    genres: string[] | null
    view_count: string
  }>(
    `${WATCHED_GROUPED_SQL}
     SELECT m.title, m.type, g.view_count,
            ARRAY(
              SELECT gg.name FROM media_item_genre mg
                JOIN genre gg ON gg.id = mg.genre_id
               WHERE mg.rating_key = m.rating_key
               ORDER BY mg.sort_order
            ) AS genres
       FROM grouped g
       JOIN media_item m ON m.rating_key = g.item_key AND m.deleted_at IS NULL
      ORDER BY g.last_viewed_at DESC
      LIMIT $2`,
    [profileId, limit],
  )

  return rows.map((row) => ({
    title: row.title,
    type: row.type,
    genres: row.genres?.filter(Boolean) ?? [],
    viewCount: Number(row.view_count),
  }))
}

/** AI 에 넘길 만큼만 줄인 작품 한 줄. */
export interface TasteCandidate {
  ratingKey: string
  type: 'movie' | 'show'
  title: string
  year: number | null
  genres: string[]
}

/**
 * 추천 후보 — **아직 안 본 작품 중에서만** 고른다.
 *
 * LLM 이 아는 작품을 자유롭게 말하면 우리 라이브러리에 없는 것을 추천한다. 그래서
 * 후보를 여기서 먼저 추려 그 목록만 넘기고, 답으로 온 것도 이 안에 있는지 다시 확인한다.
 * 차례는 "이 사람이 많이 본 장르와 겹치는 정도 → 평점 → 최근 추가" 순이다.
 */
export async function getTasteCandidates(profileId: number, limit = 60): Promise<TasteCandidate[]> {
  const rows = await query<{
    rating_key: string
    type: 'movie' | 'show'
    title: string
    year: number | null
    genres: string[] | null
  }>(
    `WITH mine AS (
       SELECT DISTINCT coalesce(h.show_rating_key, h.rating_key) AS item_key
         FROM watch_history h
        WHERE h.plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
     ),
     taste AS (
       -- 이 사람이 본 작품들의 장르마다 몇 편을 봤는가
       SELECT mg.genre_id, count(*)::int AS weight
         FROM mine
         JOIN media_item_genre mg ON mg.rating_key = mine.item_key
        GROUP BY mg.genre_id
     )
     SELECT m.rating_key, m.type, m.title, m.year,
            ARRAY(
              SELECT g.name FROM media_item_genre mg2
                JOIN genre g ON g.id = mg2.genre_id
               WHERE mg2.rating_key = m.rating_key
               ORDER BY mg2.sort_order
            ) AS genres,
            coalesce(sum(t.weight), 0) AS score
       FROM media_item m
       LEFT JOIN media_item_genre mg ON mg.rating_key = m.rating_key
       LEFT JOIN taste t ON t.genre_id = mg.genre_id
      WHERE m.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM mine WHERE mine.item_key = m.rating_key)
      GROUP BY m.rating_key
      ORDER BY score DESC,
               coalesce(m.audience_rating, m.critic_rating, 0) DESC,
               m.plex_added_at DESC NULLS LAST
      LIMIT $2`,
    [profileId, limit],
  )

  return rows.map((row) => ({
    ratingKey: row.rating_key,
    type: row.type,
    title: row.title,
    year: row.year,
    genres: row.genres?.filter(Boolean) ?? [],
  }))
}

export interface GenrePicks {
  genre: string
  ratingKeys: string[]
}

/**
 * 장르별 추천 — **LLM 을 쓰지 않는다.**
 *
 * 장르를 고르는 일(무엇을 좋아하는가)은 이미 취향 분석이 했다. 그 장르 안에서 작품을
 * 줄 세우는 일은 "안 본 것 중 평점 높은 순" 이 전부라 SQL 이 더 정확하고 공짜다.
 * 장르 5개 × 15편을 LLM 에 고르게 하면 후보 목록만 수백 줄이 되고 값도 그만큼 든다.
 */
export async function getGenrePicks(
  profileId: number,
  genres: string[],
  perGenre = 15,
): Promise<GenrePicks[]> {
  if (genres.length === 0) return []

  const rows = await query<{ genre: string; rating_keys: string[] }>(
    `WITH mine AS (
       SELECT DISTINCT coalesce(h.show_rating_key, h.rating_key) AS item_key
         FROM watch_history h
        WHERE h.plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
     ),
     ranked AS (
       SELECT g.name AS genre, m.rating_key,
              row_number() OVER (
                PARTITION BY g.name
                ORDER BY coalesce(m.audience_rating, m.critic_rating, 0) DESC,
                         m.plex_added_at DESC NULLS LAST
              ) AS rank
         FROM media_item m
         JOIN media_item_genre mg ON mg.rating_key = m.rating_key
         JOIN genre g ON g.id = mg.genre_id
        WHERE m.deleted_at IS NULL
          AND g.name = ANY($2)
          AND NOT EXISTS (SELECT 1 FROM mine WHERE mine.item_key = m.rating_key)
     )
     SELECT genre, array_agg(rating_key ORDER BY rank) AS rating_keys
       FROM ranked
      WHERE rank <= $3
      GROUP BY genre`,
    [profileId, genres, perGenre],
  )

  // 넘긴 장르 차례(많이 본 순)를 그대로 지킨다.
  const byGenre = new Map(rows.map((row) => [row.genre, row.rating_keys]))
  return genres
    .map((genre) => ({ genre, ratingKeys: byGenre.get(genre) ?? [] }))
    .filter((entry) => entry.ratingKeys.length > 0)
}
