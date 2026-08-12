import { db, queryOne } from '@/lib/db'
import {
  fetchAllEpisodes,
  fetchItemDetail,
  fetchSeasons,
  excludedSectionIds,
  fetchCollectionChildren,
  fetchCollections,
  fetchSections,
  iterateSectionItems,
  readPlexEnv,
} from '@/lib/plex/client'
import {
  clearState,
  readState,
  prefetchEpisodeThumbs,
  upsertEpisode,
  upsertItemDetail,
  upsertItemShallow,
  upsertCollection,
  upsertSeason,
  upsertSection,
  writeState,
  type ImageCounter,
} from './upsert'

// 동기화 한 번. 두 가지 종류가 있다.
//
//   incremental — 마지막 성공 이후 변경된 것만. 보통 0건이라 거의 공짜다. 30분마다.
//   full        — 전 항목을 훑고, 이번 실행에서 못 본 것은 삭제로 표시한다. 하루 1회.
//                 증분만으로는 Plex 에서 지워진 항목을 영영 못 잡기 때문에 필요하다.
//
// 어느 쪽이든 섹션별 진행 위치를 sync_state 에 남긴다. 중간에 죽어도 다음 실행이
// 그 자리에서 이어받는다 — 라이브러리가 커서 한 번에 못 끝낼 때를 위한 것이다.

export type SyncKind = 'incremental' | 'full'

const LAST_SUCCESS_KEY = 'last_success_at'
// 전체 훑기가 "언제 시작됐는지". 중간에 끊겨 다음 실행이 이어받아도 이 값은 유지된다.
const FULL_SWEEP_KEY = 'full_sweep_started_at'
// 증분 조회에 겹침을 준다. Plex 의 updatedAt 과 우리 시계가 몇 초 어긋나도
// 그 사이에 바뀐 항목을 놓치지 않는다.
const OVERLAP_SECONDS = 300
// 몇 건마다 진행 위치를 저장할지. 죽었을 때 다시 하는 양이 이만큼으로 제한된다.
const CHECKPOINT_EVERY = 10

export interface SyncResult {
  kind: SyncKind
  itemsSeen: number
  itemsUpserted: number
  episodesUpserted: number
  collectionsUpserted: number
  imagesSaved: number
  itemsDeleted: number
}

export async function runSync(kind: SyncKind): Promise<SyncResult> {
  const env = readPlexEnv()
  const startedAt = new Date()
  const counter: ImageCounter = { saved: 0 }

  const run = await queryOne<{ id: string }>(
    `INSERT INTO sync_run (kind, status) VALUES ($1, 'running') RETURNING id`,
    [kind],
  )
  const runId = run!.id

  const result: SyncResult = {
    kind,
    itemsSeen: 0,
    itemsUpserted: 0,
    episodesUpserted: 0,
    collectionsUpserted: 0,
    imagesSaved: 0,
    itemsDeleted: 0,
  }

  try {
    let updatedSince: number | undefined
    if (kind === 'incremental') {
      const last = await readState(LAST_SUCCESS_KEY)
      if (last) {
        updatedSince = Math.floor(new Date(last).getTime() / 1000) - OVERLAP_SECONDS
      }
      // 마지막 성공 기록이 없으면 전체를 훑는다(최초 실행).
    }

    // 삭제 감지의 기준 시각. 이번 실행의 시작 시각이 아니라 "훑기가 처음 시작된 시각"이어야 한다.
    // 앞선 실행이 중간에 끊겼다면 그때 처리한 항목들은 이번 실행에서 다시 안 스치는데,
    // 이번 시작 시각을 기준으로 삼으면 그것들이 통째로 삭제로 표시된다.
    let sweepStartedAt = startedAt
    if (kind === 'full') {
      const saved = await readState(FULL_SWEEP_KEY)
      if (saved) sweepStartedAt = new Date(saved)
      else await writeState(FULL_SWEEP_KEY, startedAt.toISOString())
    }

    // 제외 섹션(음악 · 가족 등)은 건너뛰고, 전에 받아둔 것이 있으면 지운다.
    // 소프트 삭제가 아니라 진짜 삭제다 — 화면에서 뺀 게 아니라 아예 안 다루기로 한 분류라
    // 검색 · 집계에서 계속 신경 쓰느니 없애는 편이 낫다. 제외를 풀면 다시 받아온다.
    const excluded = excludedSectionIds()
    if (excluded.length > 0) {
      const removed = await db.query(
        `DELETE FROM library_section WHERE id = ANY($1::int[])`,
        [excluded],
      )
      if (removed.rowCount) {
        console.log(`[sync] 제외 섹션 ${removed.rowCount}개를 정리했습니다 (${excluded.join(', ')})`)
      }
    }

    const sections = (await fetchSections(env)).filter(
      (section) => !excluded.includes(Number(section.key)),
    )
    for (const section of sections) {
      await upsertSection(section)
      await syncSection(env, section, kind, updatedSince, result, counter)
    }

    // 컬렉션은 작품을 다 넣은 뒤에 채운다 — collection_item 이 media_item 을 참조한다.
    for (const section of sections) {
      result.collectionsUpserted += await syncCollections(env, section, counter)
    }

    // 여기까지 왔다는 건 모든 섹션을 끝까지 돌았다는 뜻이다. 그때만 삭제를 판정한다.
    if (kind === 'full') {
      result.itemsDeleted = await markMissingAsDeleted(sweepStartedAt)
      await clearState(FULL_SWEEP_KEY)
    }

    await writeState(LAST_SUCCESS_KEY, startedAt.toISOString())
    result.imagesSaved = counter.saved

    await db.query(
      `UPDATE sync_run SET status = 'ok', finished_at = now(),
         items_seen = $2, items_upserted = $3, episodes_upserted = $4,
         images_saved = $5, items_deleted = $6
       WHERE id = $1`,
      [
        runId,
        result.itemsSeen,
        result.itemsUpserted,
        result.episodesUpserted,
        result.imagesSaved,
        result.itemsDeleted,
      ],
    )
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.query(
      `UPDATE sync_run SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
      [runId, message],
    )
    // 실패해도 기존 DB 는 그대로다 — 화면은 계속 뜬다.
    throw error
  }
}

async function syncSection(
  env: ReturnType<typeof readPlexEnv>,
  section: { key: string; title: string; type: string },
  kind: SyncKind,
  updatedSince: number | undefined,
  result: SyncResult,
  counter: ImageCounter,
) {
  const cursorKey = `cursor:${kind}:${section.key}`
  const saved = await readState(cursorKey)
  const startAt = saved ? Number(saved) : 0
  if (startAt > 0) {
    console.log(`[sync] 섹션 "${section.title}" — ${startAt}번째 항목부터 이어서 진행`)
  }

  const sectionId = Number(section.key)

  for await (const page of iterateSectionItems(env, section.key, { updatedSince, startAt })) {
    for (const [index, m] of page.items.entries()) {
      result.itemsSeen += 1
      // 최초 전체 동기화는 몇 시간이 걸릴 수 있다. 페이지(200건) 단위로만 찍으면
      // 그동안 아무 소식이 없어 멈춘 것처럼 보인다.
      if (result.itemsSeen % 25 === 0) {
        console.log(
          `[sync] 섹션 "${section.title}" ${page.offset + index + 1}/${page.totalSize} 진행 중`,
        )
      }
      const { ratingKey, needsDetail, needsChildren } = await upsertItemShallow(
        env,
        sectionId,
        m,
        counter,
      )
      result.itemsUpserted += 1

      if (needsDetail) {
        const detail = await fetchItemDetail(env, ratingKey)
        if (detail) await upsertItemDetail(env, ratingKey, detail, counter)
      }

      if (needsChildren) {
        result.episodesUpserted += await syncShowChildren(env, ratingKey, counter)
      }

      // 커서를 촘촘히 옮긴다. 페이지(200건) 단위로만 저장하면 250번째에서 죽었을 때
      // 다음 실행이 200부터 다시 시작하고, 같은 자리에서 또 죽으면 영영 못 넘어간다
      // (실제로 NAS 에서 이 상태에 빠졌다).
      if (result.itemsSeen % CHECKPOINT_EVERY === 0) {
        await writeState(cursorKey, String(page.offset + index + 1))
      }
    }

    await writeState(cursorKey, String(page.offset + page.items.length))
    console.log(
      `[sync] 섹션 "${section.title}" ${page.offset + page.items.length}/${page.totalSize}`,
    )
  }

  await clearState(cursorKey)
}

/**
 * 시리즈 한 편의 시즌 · 에피소드를 통째로 다시 맞춘다.
 * 에피소드는 시즌마다 부르지 않고 allLeaves 로 한 번에 받는다 — 드라마가 많으면
 * 시즌 단위 호출은 호출 수가 곧바로 수천 건이 된다.
 */
async function syncShowChildren(
  env: ReturnType<typeof readPlexEnv>,
  showRatingKey: string,
  counter: ImageCounter,
): Promise<number> {
  const boundary = new Date()

  const seasons = await fetchSeasons(env, showRatingKey)
  for (const s of seasons) {
    await upsertSeason(env, showRatingKey, s, counter)
  }

  const episodes = await fetchAllEpisodes(env, showRatingKey)
  // 썸네일을 먼저 동시에 받고, DB 쓰기는 순서대로 한다.
  const thumbs = await prefetchEpisodeThumbs(env, episodes, counter)
  for (const [index, e] of episodes.entries()) {
    await upsertEpisode(env, showRatingKey, e, thumbs[index])
  }

  // 이번에 못 본 시즌 · 에피소드는 Plex 에서 사라진 것이다.
  await db.query(
    `UPDATE season SET deleted_at = now()
      WHERE show_rating_key = $1 AND deleted_at IS NULL AND synced_at < $2`,
    [showRatingKey, boundary],
  )
  await db.query(
    `UPDATE episode SET deleted_at = now()
      WHERE show_rating_key = $1 AND deleted_at IS NULL AND synced_at < $2`,
    [showRatingKey, boundary],
  )

  await db.query(
    `UPDATE media_item SET children_synced_at = now() WHERE rating_key = $1`,
    [showRatingKey],
  )

  return episodes.length
}

/**
 * 섹션의 컬렉션을 맞춘다. 사람이 Plex 에서 직접 묶은 것이라 자주 안 바뀐다 —
 * 목록은 매번 받되(섹션당 1회), 소속 작품은 updatedAt 이 바뀐 컬렉션만 다시 받는다.
 */
async function syncCollections(
  env: ReturnType<typeof readPlexEnv>,
  section: { key: string; title: string },
  counter: ImageCounter,
): Promise<number> {
  const boundary = new Date()
  const sectionId = Number(section.key)

  const collections = await fetchCollections(env, section.key)
  for (const c of collections) {
    const ratingKey = String(c.ratingKey)
    const updatedAt = Number(c.updatedAt) || 0

    const existing = await queryOne<{ plex_updated_at: Date | null }>(
      `SELECT plex_updated_at FROM collection WHERE rating_key = $1`,
      [ratingKey],
    )
    const changed =
      !existing ||
      Math.floor((existing.plex_updated_at?.getTime() ?? 0) / 1000) !== updatedAt

    // 안 바뀌었으면 소속 작품을 다시 받지 않는다. 그래도 제목 · 편수는 갱신해 둔다.
    const children = changed ? await fetchCollectionChildren(env, ratingKey) : []
    if (changed) {
      await upsertCollection(env, sectionId, c, children, counter)
    } else {
      await db.query(`UPDATE collection SET synced_at = now() WHERE rating_key = $1`, [ratingKey])
    }
  }

  // 이번에 못 본 컬렉션은 Plex 에서 지워진 것이다.
  await db.query(
    `UPDATE collection SET deleted_at = now()
      WHERE section_id = $1 AND deleted_at IS NULL AND synced_at < $2`,
    [sectionId, boundary],
  )

  if (collections.length > 0) {
    console.log(`[sync] 섹션 "${section.title}" 컬렉션 ${collections.length}개`)
  }
  return collections.length
}

/** 전체 훑기 동안 한 번도 안 스친 항목 = Plex 에서 사라진 항목. */
async function markMissingAsDeleted(sweepStartedAt: Date): Promise<number> {
  const res = await db.query(
    `UPDATE media_item SET deleted_at = now()
      WHERE deleted_at IS NULL AND synced_at < $1`,
    [sweepStartedAt],
  )
  return res.rowCount ?? 0
}

// --- CLI ---------------------------------------------------------------------
// `./compose.sh sync` · `./compose.sh sync --full` 이 여기로 들어온다.
if (process.argv[1]?.endsWith('run.ts')) {
  const kind: SyncKind = process.argv.includes('--full') ? 'full' : 'incremental'
  runSync(kind)
    .then((r) => {
      console.log(
        `[sync] 완료 (${r.kind}) — 항목 ${r.itemsUpserted}건 · 에피소드 ${r.episodesUpserted}건 · ` +
          `컬렉션 ${r.collectionsUpserted}개 · 이미지 ${r.imagesSaved}장 · 삭제 ${r.itemsDeleted}건`,
      )
      process.exit(0)
    })
    .catch((error) => {
      console.error('[sync] 실패:', error)
      process.exit(1)
    })
}
