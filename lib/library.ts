import 'server-only'
import { db, query, queryOne } from '@/lib/db'

// 화면이 읽는 유일한 데이터 원천. 여기서 Plex 를 호출하는 일은 없다 —
// sync 워커가 미리 채워둔 DB 와 로컬 이미지 파일만 본다.

export interface LibraryItem {
  ratingKey: string
  type: 'movie' | 'show'
  title: string
  originalTitle: string | null
  year: number | null
  summary: string | null
  tagline: string | null
  contentRating: string | null
  durationMs: number | null
  criticRating: number | null
  audienceRating: number | null
  studio: string | null
  childCount: number | null
  leafCount: number | null
  poster: string | null
  backdrop: string | null
  genres: string[]
  /** "Plex에서 보기" 딥링크. 서버에서 만들어 내려보낸다 — 클라이언트가 서버 id 를 알 필요가 없다. */
  plexUrl: string
  /** 카드 아래에 한 줄 덧붙일 말. "이어서 보기" 줄에서만 채운다 */
  badge?: string
}

export interface Credit {
  name: string
  character: string | null
  thumb: string | null
}

export interface SeasonWithEpisodes {
  ratingKey: string
  seasonIndex: number | null
  title: string
  poster: string | null
  episodes: {
    ratingKey: string
    episodeIndex: number | null
    title: string
    summary: string | null
    durationMs: number | null
    thumb: string | null
    airDate: string | null
    plexUrl: string
  }[]
}

interface ItemRow {
  rating_key: string
  type: 'movie' | 'show'
  title: string
  original_title: string | null
  year: number | null
  summary: string | null
  tagline: string | null
  content_rating: string | null
  duration_ms: number | null
  critic_rating: number | null
  audience_rating: number | null
  studio: string | null
  child_count: number | null
  leaf_count: number | null
  poster_file: string | null
  backdrop_file: string | null
  genres: string[] | null
}

function mediaUrl(file: string | null): string | null {
  return file ? `/media/${file}` : null
}

/**
 * 시즌 이름. Plex 는 대개 "Season 1" 처럼 영문 기본값을 준다 — 그건 우리가 붙인 이름이 아니라
 * 자리표시자라서 한국어로 바꾼다. 사람이 따로 붙인 이름("특별편" 등)은 그대로 둔다.
 */
function seasonLabel(title: string, seasonIndex: number | null): string {
  if (!/^season\s*\d*$/i.test(title.trim())) return title
  if (seasonIndex === 0) return '스페셜'
  return seasonIndex === null ? title : `시즌 ${seasonIndex}`
}

function plexDeepLink(ratingKey: string): string {
  const serverId = process.env.PLEX_SERVER_ID ?? ''
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`)
  return `https://app.plex.tv/desktop/#!/server/${serverId}/details?key=${key}`
}

function toItem(row: ItemRow): LibraryItem {
  return {
    ratingKey: row.rating_key,
    type: row.type,
    title: row.title,
    originalTitle: row.original_title,
    year: row.year,
    summary: row.summary,
    tagline: row.tagline,
    contentRating: row.content_rating,
    durationMs: row.duration_ms,
    criticRating: row.critic_rating,
    audienceRating: row.audience_rating,
    studio: row.studio,
    childCount: row.child_count,
    leafCount: row.leaf_count,
    poster: mediaUrl(row.poster_file),
    backdrop: mediaUrl(row.backdrop_file),
    genres: row.genres?.filter(Boolean) ?? [],
    plexUrl: plexDeepLink(row.rating_key),
  }
}

// 장르는 별도 테이블이라 목록 조회마다 조인이 필요하다. 한 번에 배열로 접어서 가져온다.
const ITEM_SELECT = `
  SELECT m.rating_key, m.type, m.title, m.original_title, m.year, m.summary, m.tagline,
         m.content_rating, m.duration_ms, m.critic_rating, m.audience_rating, m.studio,
         m.child_count, m.leaf_count, m.poster_file, m.backdrop_file,
         ARRAY(
           SELECT g.name FROM media_item_genre mg
             JOIN genre g ON g.id = mg.genre_id
            WHERE mg.rating_key = m.rating_key
            ORDER BY mg.sort_order
         ) AS genres
    FROM media_item m
`

// --- 섹션 (Plex 의 라이브러리 분류를 그대로 쓴다) ----------------------------

export interface LibrarySection {
  id: number
  title: string
  /** "영화 | 한국" 의 앞쪽. 상단 메뉴의 묶음이 된다 */
  group: string
  /** 뒤쪽. 없으면 group 과 같다 */
  label: string
  count: number
}

/**
 * Plex 섹션 제목은 "영화 | 한국" 처럼 `구분 | 하위` 형식이다.
 * 이 규칙이 곧 사용자가 Plex 에서 보던 분류라, 우리가 새로 묶지 않고 그대로 따른다.
 */
function splitSectionTitle(title: string): { group: string; label: string } {
  const [group, sub] = title.split('|').map((part) => part.trim())
  return { group, label: sub || group }
}

// 화면에 놓을 순서. Plex 섹션 id 는 만든 순서라 그대로 쓰면 뒤죽박죽이다.
// 여기 없는 이름은 뒤에 붙는다 — 새 라이브러리를 만들어도 화면에서 사라지지 않는다.
const GROUP_ORDER = ['영화', '드라마', '애니', '예능', '다큐']
const LABEL_ORDER: Record<string, string[]> = {
  영화: ['한국', '외국', '고전', '뮤지컬'],
  드라마: ['한국', '외국', '일본', '중국'],
  애니: ['TVA', '극장판'],
}

function rankOf(order: string[], value: string): number {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

/** 섹션 정렬 기준. 홈 줄 · 상단 메뉴 · 시리즈 모음이 전부 이걸 쓴다. */
export function compareSectionTitles(a: string, b: string): number {
  const left = splitSectionTitle(a)
  const right = splitSectionTitle(b)

  const byGroup = rankOf(GROUP_ORDER, left.group) - rankOf(GROUP_ORDER, right.group)
  if (byGroup !== 0) return byGroup
  if (left.group !== right.group) return left.group.localeCompare(right.group, 'ko')

  const labels = LABEL_ORDER[left.group] ?? []
  const byLabel = rankOf(labels, left.label) - rankOf(labels, right.label)
  return byLabel !== 0 ? byLabel : left.label.localeCompare(right.label, 'ko')
}

export async function getSections(): Promise<LibrarySection[]> {
  const rows = await query<{ id: number; title: string; count: string }>(
    `SELECT s.id, s.title, count(m.rating_key) AS count
       FROM library_section s
       LEFT JOIN media_item m ON m.section_id = s.id AND m.deleted_at IS NULL
      GROUP BY s.id, s.title
      HAVING count(m.rating_key) > 0`,
  )
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      ...splitSectionTitle(row.title),
      count: Number(row.count),
    }))
    .sort((a, b) => compareSectionTitles(a.title, b.title))
}

export async function getSection(id: number): Promise<LibrarySection | null> {
  const sections = await getSections()
  return sections.find((section) => section.id === id) ?? null
}

/**
 * 상단 메뉴용으로 섹션을 구분(영화 · 드라마 · 애니 …)별로 묶는다.
 * 입력이 이미 compareSectionTitles 로 정렬돼 있다는 전제라 여기서 다시 정렬하지 않는다.
 */
export function groupSections(sections: LibrarySection[]): {
  group: string
  sections: LibrarySection[]
}[] {
  const groups: { group: string; sections: LibrarySection[] }[] = []
  for (const section of sections) {
    const existing = groups.find((g) => g.group === section.group)
    if (existing) existing.sections.push(section)
    else groups.push({ group: section.group, sections: [section] })
  }
  return groups
}

// --- 컬렉션 (Plex 에서 사람이 직접 묶은 시리즈 모음) --------------------------

export interface Collection {
  ratingKey: string
  title: string
  summary: string | null
  poster: string | null
  backdrop: string | null
  count: number
  /** 어느 라이브러리에 속한 컬렉션인지. 목록 화면의 소제목으로 쓴다 */
  sectionId: number
  sectionTitle: string
}

interface CollectionRow {
  rating_key: string
  title: string
  summary: string | null
  poster_file: string | null
  backdrop_file: string | null
  count: string
  section_id: number
  section_title: string
}

function toCollection(row: CollectionRow): Collection {
  return {
    ratingKey: row.rating_key,
    title: row.title,
    summary: row.summary,
    poster: mediaUrl(row.poster_file),
    backdrop: mediaUrl(row.backdrop_file),
    count: Number(row.count),
    sectionId: row.section_id,
    sectionTitle: row.section_title,
  }
}

// 실제로 우리 DB 에 있는 작품 수를 센다. Plex 의 child_count 는 제외 섹션 작품까지 포함할 수 있다.
const COLLECTION_SELECT = `
  SELECT c.rating_key, c.title, c.summary, c.poster_file, c.backdrop_file,
         c.section_id, s.title AS section_title,
         (SELECT count(*) FROM collection_item ci
            JOIN media_item m ON m.rating_key = ci.rating_key AND m.deleted_at IS NULL
           WHERE ci.collection_rating_key = c.rating_key) AS count
    FROM collection c
    JOIN library_section s ON s.id = c.section_id
`

export async function listCollections(sectionId?: number): Promise<Collection[]> {
  const rows = await query<CollectionRow>(
    `${COLLECTION_SELECT}
      WHERE c.deleted_at IS NULL
        ${sectionId ? 'AND c.section_id = $1' : ''}
      ORDER BY coalesce(c.title_sort, c.title)`,
    sectionId ? [sectionId] : [],
  )
  return rows
    .filter((row) => Number(row.count) > 0)
    .map(toCollection)
    .sort((a, b) => compareSectionTitles(a.sectionTitle, b.sectionTitle))
}

export async function getCollection(ratingKey: string): Promise<Collection | null> {
  const row = await queryOne<CollectionRow>(
    `${COLLECTION_SELECT} WHERE c.rating_key = $1 AND c.deleted_at IS NULL`,
    [ratingKey],
  )
  return row ? toCollection(row) : null
}

/** 컬렉션에 속한 작품. Plex 가 준 순서(대개 개봉순) 그대로. */
export async function getCollectionItems(ratingKey: string): Promise<LibraryItem[]> {
  const rows = await query<ItemRow>(
    `${ITEM_SELECT}
      JOIN collection_item ci ON ci.rating_key = m.rating_key
     WHERE ci.collection_rating_key = $1 AND m.deleted_at IS NULL
     ORDER BY ci.sort_order`,
    [ratingKey],
  )
  return rows.map(toItem)
}

/** 시리즈 모음 목록 화면 — 라이브러리별로 묶는다. */
export function groupCollectionsBySection(
  collections: Collection[],
): { sectionId: number; sectionTitle: string; collections: Collection[] }[] {
  const groups: { sectionId: number; sectionTitle: string; collections: Collection[] }[] = []
  for (const collection of collections) {
    const existing = groups.find((g) => g.sectionId === collection.sectionId)
    if (existing) existing.collections.push(collection)
    else
      groups.push({
        sectionId: collection.sectionId,
        sectionTitle: collection.sectionTitle,
        collections: [collection],
      })
  }
  return groups
}

/** 이 작품이 속한 컬렉션들. 상세 페이지의 "시리즈" 줄에 쓴다. */
export async function getCollectionsForItem(ratingKey: string): Promise<Collection[]> {
  const rows = await query<CollectionRow>(
    `${COLLECTION_SELECT}
      JOIN collection_item ci ON ci.collection_rating_key = c.rating_key
     WHERE ci.rating_key = $1 AND c.deleted_at IS NULL
     ORDER BY coalesce(c.title_sort, c.title)`,
    [ratingKey],
  )
  return rows.map(toCollection)
}

/** 홈 상단 히어로 — 배경 이미지가 있는 것 중 최근에 추가된 순. 자동으로 넘어간다. */
export async function getHeroItems(limit = 10): Promise<LibraryItem[]> {
  const rows = await query<ItemRow>(
    `${ITEM_SELECT}
      WHERE m.deleted_at IS NULL AND m.backdrop_file IS NOT NULL
      ORDER BY m.plex_added_at DESC NULLS LAST
      LIMIT $1`,
    [limit],
  )
  return rows.map(toItem)
}

export interface LibraryRow {
  key: string
  title: string
  /** 줄 제목을 누르면 갈 곳. 섹션 줄에만 있다 */
  href?: string
  items: LibraryItem[]
}

const ROW_SIZE = 20

/**
 * 홈 화면의 가로 줄들.
 * 맨 위 "최근 추가" 를 빼면 나머지는 전부 Plex 섹션 그대로다 — 우리가 새로 묶지 않는다.
 */
export async function getHomeRows(): Promise<LibraryRow[]> {
  const [recent, sections] = await Promise.all([
    query<ItemRow>(
      `${ITEM_SELECT}
        WHERE m.deleted_at IS NULL
        ORDER BY m.plex_added_at DESC NULLS LAST LIMIT $1`,
      [ROW_SIZE],
    ),
    getSections(),
  ])

  const sectionRows = await Promise.all(
    sections.map(async (section) => ({
      key: `section-${section.id}`,
      title: section.title,
      href: `/library/${section.id}`,
      items: (
        await query<ItemRow>(
          `${ITEM_SELECT}
            WHERE m.deleted_at IS NULL AND m.section_id = $1
            ORDER BY m.plex_added_at DESC NULLS LAST LIMIT $2`,
          [section.id, ROW_SIZE],
        )
      ).map(toItem),
    })),
  )

  return [{ key: 'recent', title: '최근 추가', items: recent.map(toItem) }, ...sectionRows].filter(
    (row) => row.items.length > 0,
  )
}

// --- 이어서 보기 (프로필별) ---------------------------------------------------
//
// Plex 에서 남의 재생 위치(viewOffset)는 못 가져온다 — `/library/onDeck` 은 accountID 를
// 조용히 무시하고, 공유 친구의 토큰은 얻을 방법이 없다(database/0007_watch_history.sql).
// 그래서 "37분 남음" 이 아니라 **마지막으로 본 화의 다음 화**를 보여준다.
//
// 영화는 넣지 않는다. 기록에 남았다는 건 다 봤다는 뜻이라 이어볼 것이 없다.

/** 이 프로필이 보다 만 시리즈. 마지막으로 본 시각이 최근인 순. */
export async function getContinueWatching(profileId: number, limit = 20): Promise<LibraryItem[]> {
  const rows = await query<ItemRow & { next_season: number; next_episode: number }>(
    `WITH last_watched AS (
       -- 시리즈마다 이 사람이 마지막으로 본 화
       SELECT DISTINCT ON (h.show_rating_key)
              h.show_rating_key, h.viewed_at, e.season_index, e.episode_index
         FROM watch_history h
         JOIN episode e ON e.rating_key = h.rating_key
        WHERE h.type = 'episode'
          AND h.plex_account_id = (SELECT plex_account_id FROM profile WHERE id = $1)
          AND e.season_index IS NOT NULL AND e.episode_index IS NOT NULL
        ORDER BY h.show_rating_key, h.viewed_at DESC
     ),
     next_up AS (
       -- 그 다음 화. 없으면(다 봤으면) 이 시리즈는 줄에서 빠진다
       SELECT DISTINCT ON (l.show_rating_key)
              l.show_rating_key, l.viewed_at, e.season_index, e.episode_index
         FROM last_watched l
         JOIN episode e ON e.show_rating_key = l.show_rating_key AND e.deleted_at IS NULL
        WHERE e.season_index IS NOT NULL AND e.episode_index IS NOT NULL
          AND (e.season_index, e.episode_index) > (l.season_index, l.episode_index)
        ORDER BY l.show_rating_key, e.season_index, e.episode_index
     )
     SELECT item.*, n.season_index AS next_season, n.episode_index AS next_episode
       FROM next_up n
       JOIN LATERAL (
         ${ITEM_SELECT} WHERE m.rating_key = n.show_rating_key AND m.deleted_at IS NULL
       ) item ON true
      ORDER BY n.viewed_at DESC
      LIMIT $2`,
    [profileId, limit],
  )

  return rows.map((row) => ({
    ...toItem(row),
    badge:
      row.next_season === 0
        ? `스페셜 ${row.next_episode}화부터`
        : `시즌 ${row.next_season} · ${row.next_episode}화부터`,
  }))
}

// --- 연재 중인 시리즈 (관리자가 고른다) --------------------------------------
//
// Plex 는 "지금 연재 중인가" 를 모른다. media_item 에 컬럼을 붙이면 sync 가 덮어쓰므로
// featured_series 에 따로 담는다(database/0005_featured_series.sql).

/** 홈 최상단 줄. 관리자가 켠 시리즈만, 정한 순서대로. */
export async function getFeaturedSeries(): Promise<LibraryItem[]> {
  const rows = await query<ItemRow>(
    `${ITEM_SELECT}
      JOIN featured_series f ON f.rating_key = m.rating_key
     WHERE m.deleted_at IS NULL
     ORDER BY f.sort_order, f.created_at DESC`,
  )
  return rows.map(toItem)
}

export interface AdminShow {
  ratingKey: string
  title: string
  year: number | null
  poster: string | null
  sectionTitle: string
  featured: boolean
}

/** 관리자 화면 — 시리즈 전체에 연재 여부를 얹는다. 켠 것이 위로 온다. */
export async function listShowsForAdmin(): Promise<AdminShow[]> {
  const rows = await query<{
    rating_key: string
    title: string
    year: number | null
    poster_file: string | null
    section_title: string
    featured: boolean
  }>(
    `SELECT m.rating_key, m.title, m.year, m.poster_file, s.title AS section_title,
            (f.rating_key IS NOT NULL) AS featured
       FROM media_item m
       JOIN library_section s ON s.id = m.section_id
       LEFT JOIN featured_series f ON f.rating_key = m.rating_key
      WHERE m.deleted_at IS NULL AND m.type = 'show'
      ORDER BY (f.rating_key IS NOT NULL) DESC, f.sort_order,
               coalesce(m.title_sort, m.title)`,
  )
  return rows.map((row) => ({
    ratingKey: row.rating_key,
    title: row.title,
    year: row.year,
    poster: mediaUrl(row.poster_file),
    sectionTitle: row.section_title,
    featured: row.featured,
  }))
}

/** 연재 표시를 켜고 끈다. */
export async function setFeatured(ratingKey: string, featured: boolean): Promise<void> {
  if (featured) {
    await db.query(`INSERT INTO featured_series (rating_key) VALUES ($1) ON CONFLICT DO NOTHING`, [
      ratingKey,
    ])
    return
  }
  await db.query(`DELETE FROM featured_series WHERE rating_key = $1`, [ratingKey])
}

export type SortKey = 'added' | 'title' | 'year' | 'rating'

const SORT_SQL: Record<SortKey, string> = {
  added: 'm.plex_added_at DESC NULLS LAST',
  // 정렬은 DB 의 ko-KR ICU 콜레이션을 그대로 탄다(한글 · 영문 · 숫자 섞여도 자연스럽게)
  title: 'coalesce(m.title_sort, m.title) ASC',
  year: 'm.year DESC NULLS LAST',
  rating: 'coalesce(m.audience_rating, m.critic_rating) DESC NULLS LAST',
}

/** 영화 · 시리즈 목록 페이지. */
export async function listItems(options: {
  type?: 'movie' | 'show'
  sectionId?: number
  sort?: SortKey
  page?: number
  pageSize?: number
}): Promise<{ items: LibraryItem[]; total: number }> {
  const { type, sectionId, sort = 'added', page = 1, pageSize = 60 } = options
  const conditions = ['m.deleted_at IS NULL']
  const params: unknown[] = []

  if (type) {
    params.push(type)
    conditions.push(`m.type = $${params.length}`)
  }
  if (sectionId) {
    params.push(sectionId)
    conditions.push(`m.section_id = $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const countRow = await queryOne<{ count: string }>(
    `SELECT count(*) FROM media_item m WHERE ${where}`,
    params,
  )

  params.push(pageSize, (page - 1) * pageSize)
  const rows = await query<ItemRow>(
    `${ITEM_SELECT} WHERE ${where}
      ORDER BY ${SORT_SQL[sort]}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  return { items: rows.map(toItem), total: Number(countRow?.count ?? 0) }
}

export async function getItem(ratingKey: string): Promise<LibraryItem | null> {
  const row = await queryOne<ItemRow>(
    `${ITEM_SELECT} WHERE m.rating_key = $1 AND m.deleted_at IS NULL`,
    [ratingKey],
  )
  return row ? toItem(row) : null
}

export async function getCredits(
  ratingKey: string,
): Promise<{ directors: string[]; writers: string[]; cast: Credit[] }> {
  const rows = await query<{
    role: 'director' | 'writer' | 'actor'
    name: string
    character: string | null
    thumb_file: string | null
  }>(
    `SELECT c.role, p.name, c.character, p.thumb_file
       FROM credit c JOIN person p ON p.id = c.person_id
      WHERE c.rating_key = $1
      ORDER BY c.sort_order`,
    [ratingKey],
  )

  return {
    directors: rows.filter((r) => r.role === 'director').map((r) => r.name),
    writers: rows.filter((r) => r.role === 'writer').map((r) => r.name),
    cast: rows
      .filter((r) => r.role === 'actor')
      .map((r) => ({ name: r.name, character: r.character, thumb: mediaUrl(r.thumb_file) })),
  }
}

/** 시리즈 상세의 시즌 · 에피소드. 에피소드를 한 번에 읽어 시즌별로 접는다. */
export async function getSeasons(showRatingKey: string): Promise<SeasonWithEpisodes[]> {
  const seasons = await query<{
    rating_key: string
    season_index: number | null
    title: string
    poster_file: string | null
  }>(
    `SELECT rating_key, season_index, title, poster_file
       FROM season
      WHERE show_rating_key = $1 AND deleted_at IS NULL
      ORDER BY season_index NULLS LAST`,
    [showRatingKey],
  )

  const episodes = await query<{
    rating_key: string
    season_rating_key: string | null
    season_index: number | null
    episode_index: number | null
    title: string
    summary: string | null
    duration_ms: number | null
    thumb_file: string | null
    originally_available_at: Date | null
  }>(
    `SELECT rating_key, season_rating_key, season_index, episode_index, title, summary,
            duration_ms, thumb_file, originally_available_at
       FROM episode
      WHERE show_rating_key = $1 AND deleted_at IS NULL
      ORDER BY season_index NULLS LAST, episode_index NULLS LAST`,
    [showRatingKey],
  )

  return seasons.map((s) => ({
    ratingKey: s.rating_key,
    seasonIndex: s.season_index,
    title: seasonLabel(s.title, s.season_index),
    poster: mediaUrl(s.poster_file),
    episodes: episodes
      .filter((e) =>
        // 에피소드가 시즌에 안 붙어 있는 경우가 있어 시즌 번호로도 맞춰본다.
        e.season_rating_key ? e.season_rating_key === s.rating_key : e.season_index === s.season_index,
      )
      .map((e) => ({
        ratingKey: e.rating_key,
        episodeIndex: e.episode_index,
        title: e.title,
        summary: e.summary,
        durationMs: e.duration_ms,
        thumb: mediaUrl(e.thumb_file),
        airDate: e.originally_available_at
          ? new Date(e.originally_available_at).toISOString().slice(0, 10)
          : null,
        plexUrl: plexDeepLink(e.rating_key),
      })),
  }))
}

/** 제목 · 원제 · 출연진 부분일치 검색. */
export async function searchItems(term: string, limit = 40): Promise<LibraryItem[]> {
  const trimmed = term.trim()
  if (trimmed.length === 0) return []

  const rows = await query<ItemRow>(
    `${ITEM_SELECT}
      WHERE m.deleted_at IS NULL
        AND (
          m.title ILIKE '%' || $1 || '%'
          OR m.original_title ILIKE '%' || $1 || '%'
          OR EXISTS (
            SELECT 1 FROM credit c JOIN person p ON p.id = c.person_id
             WHERE c.rating_key = m.rating_key AND p.name ILIKE '%' || $1 || '%'
          )
        )
      ORDER BY
        -- 제목이 검색어로 시작하는 것을 먼저 보여준다
        (m.title ILIKE $1 || '%') DESC,
        m.plex_added_at DESC NULLS LAST
      LIMIT $2`,
    [trimmed, limit],
  )
  return rows.map(toItem)
}

/** 제목이 걸리는 컬렉션. 검색 결과 위쪽에 따로 보여준다. */
export async function searchCollections(term: string, limit = 8): Promise<Collection[]> {
  const trimmed = term.trim()
  if (trimmed.length === 0) return []

  const rows = await query<CollectionRow>(
    `${COLLECTION_SELECT}
      WHERE c.deleted_at IS NULL AND c.title ILIKE '%' || $1 || '%'
      ORDER BY (c.title ILIKE $1 || '%') DESC, coalesce(c.title_sort, c.title)
      LIMIT $2`,
    [trimmed, limit],
  )
  return rows.filter((row) => Number(row.count) > 0).map(toCollection)
}

/** 마지막 동기화 상태 — 화면 하단에 표시한다. */
export async function getLastSync(): Promise<{ finishedAt: Date; status: string } | null> {
  return queryOne<{ finishedAt: Date; status: string }>(
    `SELECT finished_at AS "finishedAt", status FROM sync_run
      WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
  )
}
