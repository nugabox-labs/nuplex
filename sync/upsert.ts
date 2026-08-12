import { db, queryOne } from '@/lib/db'
import type { PlexEnv } from '@/lib/plex/client'
import { createLimiter, saveImage, type ImageKind } from './images'

// Plex 응답 한 건을 DB 한 행으로 옮기는 계층. Plex 의 필드 이름과 우리 컬럼 이름을
// 여기서만 만나게 해서, Plex 응답 모양이 바뀌어도 고칠 곳이 한 군데로 남게 한다.

/** Plex 의 unix 초를 Postgres timestamptz 로. 0 · undefined 는 NULL. */
function ts(seconds: unknown): Date | null {
  const n = Number(seconds)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null
}

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function text(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s.length > 0 ? s : null
}

/** Plex 의 originallyAvailableAt 은 'YYYY-MM-DD' 문자열이다. */
function date(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export interface ImageCounter {
  saved: number
}

// 이미지 내려받기 동시 실행 수. NAS 한 대가 감당할 만큼만 연다.
const imageLimiter = createLimiter(5)

async function image(
  env: PlexEnv,
  kind: ImageKind,
  plexPath: unknown,
  counter: ImageCounter,
): Promise<string | null> {
  const result = await saveImage(env, kind, text(plexPath))
  if (result.downloaded) counter.saved += 1
  return result.file
}

export async function upsertSection(section: { key: string; title: string; type: string }) {
  await db.query(
    `INSERT INTO library_section (id, title, type, synced_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title, type = EXCLUDED.type, synced_at = now()`,
    [Number(section.key), section.title, section.type],
  )
}

/**
 * 섹션 목록(/all)에서 온 얕은 항목을 반영한다.
 * 여기서는 Plex 호출을 하지 않는다 — 상세가 필요한지 판단만 하고 돌려준다.
 */
export async function upsertItemShallow(
  env: PlexEnv,
  sectionId: number,
  m: any,
  counter: ImageCounter,
): Promise<{ ratingKey: string; needsDetail: boolean; needsChildren: boolean }> {
  const ratingKey = String(m.ratingKey)
  const updatedAt = ts(m.updatedAt)

  const existing = await queryOne<{
    plex_updated_at: Date | null
    detail_synced_at: Date | null
    children_synced_at: Date | null
  }>(
    `SELECT plex_updated_at, detail_synced_at, children_synced_at
       FROM media_item WHERE rating_key = $1`,
    [ratingKey],
  )

  const changed =
    !existing ||
    existing.plex_updated_at?.getTime() !== updatedAt?.getTime()

  const [posterFile, backdropFile] = await Promise.all([
    image(env, 'posters', m.thumb, counter),
    image(env, 'backdrops', m.art, counter),
  ])

  await db.query(
    `INSERT INTO media_item (
       rating_key, section_id, type, title, title_sort, original_title, year,
       tagline, summary, content_rating, duration_ms, critic_rating, audience_rating,
       studio, originally_available_at, child_count, leaf_count,
       poster_file, backdrop_file, plex_added_at, plex_updated_at,
       deleted_at, synced_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17,
       $18, $19, $20, $21,
       NULL, now()
     )
     ON CONFLICT (rating_key) DO UPDATE SET
       section_id = EXCLUDED.section_id,
       type = EXCLUDED.type,
       title = EXCLUDED.title,
       title_sort = EXCLUDED.title_sort,
       original_title = EXCLUDED.original_title,
       year = EXCLUDED.year,
       tagline = EXCLUDED.tagline,
       summary = EXCLUDED.summary,
       content_rating = EXCLUDED.content_rating,
       duration_ms = EXCLUDED.duration_ms,
       critic_rating = EXCLUDED.critic_rating,
       audience_rating = EXCLUDED.audience_rating,
       studio = EXCLUDED.studio,
       originally_available_at = EXCLUDED.originally_available_at,
       child_count = EXCLUDED.child_count,
       leaf_count = EXCLUDED.leaf_count,
       -- 이미지 다운로드가 실패했으면(NULL) 기존 파일을 지우지 않는다
       poster_file = COALESCE(EXCLUDED.poster_file, media_item.poster_file),
       backdrop_file = COALESCE(EXCLUDED.backdrop_file, media_item.backdrop_file),
       plex_added_at = EXCLUDED.plex_added_at,
       plex_updated_at = EXCLUDED.plex_updated_at,
       deleted_at = NULL,
       synced_at = now()`,
    [
      ratingKey,
      sectionId,
      m.type === 'show' ? 'show' : 'movie',
      text(m.title) ?? '제목 없음',
      text(m.titleSort) ?? text(m.title),
      text(m.originalTitle),
      num(m.year),
      text(m.tagline),
      text(m.summary),
      text(m.contentRating),
      num(m.duration),
      num(m.rating),
      num(m.audienceRating),
      text(m.studio),
      date(m.originallyAvailableAt),
      num(m.childCount),
      num(m.leafCount),
      posterFile,
      backdropFile,
      ts(m.addedAt),
      updatedAt,
    ],
  )

  return {
    ratingKey,
    needsDetail: changed || !existing?.detail_synced_at,
    needsChildren:
      m.type === 'show' && (changed || !existing?.children_synced_at),
  }
}

/** 상세 응답의 장르 · 감독 · 각본 · 출연을 반영한다. */
export async function upsertItemDetail(
  env: PlexEnv,
  ratingKey: string,
  detail: any,
  counter: ImageCounter,
) {
  await upsertGenres(ratingKey, detail.Genre ?? [])

  await db.query(`DELETE FROM credit WHERE rating_key = $1`, [ratingKey])
  await upsertCredits(env, ratingKey, 'director', detail.Director ?? [], counter)
  await upsertCredits(env, ratingKey, 'writer', detail.Writer ?? [], counter)
  await upsertCredits(env, ratingKey, 'actor', detail.Role ?? [], counter)

  await db.query(
    `UPDATE media_item SET detail_synced_at = now() WHERE rating_key = $1`,
    [ratingKey],
  )
}

async function upsertGenres(ratingKey: string, genres: any[]) {
  await db.query(`DELETE FROM media_item_genre WHERE rating_key = $1`, [ratingKey])
  let order = 0
  for (const g of genres) {
    const name = text(g?.tag)
    if (!name) continue
    const row = await queryOne<{ id: number }>(
      `INSERT INTO genre (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name],
    )
    if (!row) continue
    await db.query(
      `INSERT INTO media_item_genre (rating_key, genre_id, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [ratingKey, row.id, order++],
    )
  }
}

async function upsertCredits(
  env: PlexEnv,
  ratingKey: string,
  role: 'director' | 'writer' | 'actor',
  people: any[],
  counter: ImageCounter,
) {
  // 출연진은 상위 20명까지만 둔다. 그 아래는 화면에 안 나오는데 인물 테이블만 불린다.
  const limited = role === 'actor' ? people.slice(0, 20) : people

  // 썸네일을 먼저 동시에 받아둔다. DB 쓰기는 아래에서 순서대로 한다 —
  // genre · person 의 ON CONFLICT 를 동시에 때리면 교착 위험이 생긴다.
  const thumbFiles = await Promise.all(
    limited.map((p) =>
      role === 'actor'
        ? imageLimiter(() => image(env, 'people', p?.thumb, counter))
        : Promise.resolve(null),
    ),
  )

  let order = 0
  for (const [index, p] of limited.entries()) {
    const name = text(p?.tag)
    if (!name) continue
    const thumbFile = thumbFiles[index]
    const person = await queryOne<{ id: number }>(
      `INSERT INTO person (name, thumb_file) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE
         SET thumb_file = COALESCE(EXCLUDED.thumb_file, person.thumb_file)
       RETURNING id`,
      [name, thumbFile],
    )
    if (!person) continue
    await db.query(
      `INSERT INTO credit (rating_key, person_id, role, character, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (rating_key, person_id, role) DO UPDATE
         SET character = EXCLUDED.character, sort_order = EXCLUDED.sort_order`,
      [ratingKey, person.id, role, text(p?.role), order++],
    )
  }
}

export async function upsertSeason(env: PlexEnv, showRatingKey: string, s: any, counter: ImageCounter) {
  const posterFile = await image(env, 'seasons', s.thumb, counter)
  await db.query(
    `INSERT INTO season (
       rating_key, show_rating_key, season_index, title, summary,
       poster_file, leaf_count, plex_updated_at, deleted_at, synced_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, now())
     ON CONFLICT (rating_key) DO UPDATE SET
       show_rating_key = EXCLUDED.show_rating_key,
       season_index = EXCLUDED.season_index,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       poster_file = COALESCE(EXCLUDED.poster_file, season.poster_file),
       leaf_count = EXCLUDED.leaf_count,
       plex_updated_at = EXCLUDED.plex_updated_at,
       deleted_at = NULL,
       synced_at = now()`,
    [
      String(s.ratingKey),
      showRatingKey,
      num(s.index),
      text(s.title) ?? `시즌 ${num(s.index) ?? ''}`.trim(),
      text(s.summary),
      posterFile,
      num(s.leafCount),
      ts(s.updatedAt),
    ],
  )
}

/**
 * 에피소드 썸네일을 미리 동시에 받아둔다.
 * 시리즈 하나에 에피소드가 100개면 직렬로 받을 때 그 시리즈에만 몇 분이 걸린다.
 */
export function prefetchEpisodeThumbs(
  env: PlexEnv,
  episodes: any[],
  counter: ImageCounter,
): Promise<(string | null)[]> {
  return Promise.all(
    episodes.map((e) => imageLimiter(() => image(env, 'episodes', e.thumb, counter))),
  )
}

export async function upsertEpisode(
  env: PlexEnv,
  showRatingKey: string,
  e: any,
  thumbFile: string | null,
) {
  await db.query(
    `INSERT INTO episode (
       rating_key, show_rating_key, season_rating_key, season_index, episode_index,
       title, summary, duration_ms, thumb_file, originally_available_at,
       plex_added_at, plex_updated_at, deleted_at, synced_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, now())
     ON CONFLICT (rating_key) DO UPDATE SET
       show_rating_key = EXCLUDED.show_rating_key,
       season_rating_key = EXCLUDED.season_rating_key,
       season_index = EXCLUDED.season_index,
       episode_index = EXCLUDED.episode_index,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       duration_ms = EXCLUDED.duration_ms,
       thumb_file = COALESCE(EXCLUDED.thumb_file, episode.thumb_file),
       originally_available_at = EXCLUDED.originally_available_at,
       plex_added_at = EXCLUDED.plex_added_at,
       plex_updated_at = EXCLUDED.plex_updated_at,
       deleted_at = NULL,
       synced_at = now()`,
    [
      String(e.ratingKey),
      showRatingKey,
      e.parentRatingKey ? String(e.parentRatingKey) : null,
      num(e.parentIndex),
      num(e.index),
      text(e.title) ?? '제목 없음',
      text(e.summary),
      num(e.duration),
      thumbFile,
      date(e.originallyAvailableAt),
      ts(e.addedAt),
      ts(e.updatedAt),
    ],
  )
}

/**
 * 컬렉션 하나와 그 소속 작품을 반영한다.
 *
 * `children` 은 Plex 가 준 순서 그대로다(대개 개봉순). 우리가 다시 정렬하지 않는다.
 * 아직 우리 DB 에 없는 작품(다른 섹션이거나 제외된 섹션)은 건너뛴다 — 외래키가 걸려 있다.
 */
export async function upsertCollection(
  env: PlexEnv,
  sectionId: number,
  c: any,
  children: any[],
  counter: ImageCounter,
): Promise<void> {
  const ratingKey = String(c.ratingKey)

  const [posterFile, backdropFile] = await Promise.all([
    image(env, 'posters', c.thumb, counter),
    image(env, 'backdrops', c.art, counter),
  ])

  await db.query(
    `INSERT INTO collection (
       rating_key, section_id, title, title_sort, summary,
       poster_file, backdrop_file, child_count,
       plex_added_at, plex_updated_at, deleted_at, synced_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, now())
     ON CONFLICT (rating_key) DO UPDATE SET
       section_id = EXCLUDED.section_id,
       title = EXCLUDED.title,
       title_sort = EXCLUDED.title_sort,
       summary = EXCLUDED.summary,
       poster_file = COALESCE(EXCLUDED.poster_file, collection.poster_file),
       backdrop_file = COALESCE(EXCLUDED.backdrop_file, collection.backdrop_file),
       child_count = EXCLUDED.child_count,
       plex_added_at = EXCLUDED.plex_added_at,
       plex_updated_at = EXCLUDED.plex_updated_at,
       deleted_at = NULL,
       synced_at = now()`,
    [
      ratingKey,
      sectionId,
      text(c.title) ?? '제목 없음',
      text(c.titleSort) ?? text(c.title),
      text(c.summary),
      posterFile,
      backdropFile,
      num(c.childCount),
      ts(c.addedAt),
      ts(c.updatedAt),
    ],
  )

  // 소속은 통째로 다시 쓴다. 빠진 작품을 따로 찾아 지우는 것보다 단순하고, 건수도 적다.
  await db.query(`DELETE FROM collection_item WHERE collection_rating_key = $1`, [ratingKey])

  let order = 0
  for (const child of children) {
    await db.query(
      `INSERT INTO collection_item (collection_rating_key, rating_key, sort_order)
       SELECT $1, $2, $3
        WHERE EXISTS (SELECT 1 FROM media_item WHERE rating_key = $2)
       ON CONFLICT DO NOTHING`,
      [ratingKey, String(child.ratingKey), order++],
    )
  }
}

/** 동기화 커서 — 중간에 죽어도 다음 실행이 여기서부터 이어받는다. */
export async function readState(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string | null }>(
    `SELECT value FROM sync_state WHERE key = $1`,
    [key],
  )
  return row?.value ?? null
}

export async function writeState(key: string, value: string | null) {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  )
}

export async function clearState(key: string) {
  await db.query(`DELETE FROM sync_state WHERE key = $1`, [key])
}
