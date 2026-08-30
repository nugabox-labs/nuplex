import { query } from '@/lib/db'
import { hasApiKey } from '@/lib/ai/deepseek'
import { NotEnoughHistoryError, TASTE_PROMPT_VERSION, generateTaste } from '@/lib/ai/taste'

// 취향 분석을 미리 돌려 담아둔다.
//
// 딥시크 응답이 30초~1분이라 화면에서 부를 수 없다. Plex 를 워커로 몰아넣은 것과 같은
// 이유다 — 화면은 DB 만 읽는다. 시청 기록이 갱신되는 자리가 곧 취향이 바뀌는 자리라
// 증분 동기화 끝에 붙인다(30분마다).
//
// **본 편수가 달라진 프로필만** 돈다. 안 본 사람에게는 호출이 나가지 않는다.

/** 한 번에 몇 명까지 돌릴지. 한 명에 1분이 걸려 동기화 주기를 통째로 먹지 않게 막는다 */
const MAX_PER_RUN = 5

interface Stale {
  profile_id: number
  name: string
  reason: string
}

/**
 * 다시 분석해야 하는 프로필을 찾아 차례로 돌린다.
 *
 * 한 명이 실패해도 다음 사람으로 넘어간다. 이건 곁다리라 동기화를 막으면 안 된다.
 */
export async function refreshTastes(): Promise<{ done: number; failed: number }> {
  if (!hasApiKey()) return { done: 0, failed: 0 }

  const stale = await query<Stale>(
    `WITH views AS (
       -- 프로필마다 지금 본 편수. 라이브러리에 남아 있는 것만 센다
       SELECT p.id AS profile_id, count(h.history_key) AS views
         FROM profile p
         LEFT JOIN watch_history h ON h.plex_account_id = p.plex_account_id
         LEFT JOIN episode e
           ON h.type = 'episode' AND e.rating_key = h.rating_key AND e.deleted_at IS NULL
         LEFT JOIN media_item m
           ON h.type = 'movie' AND m.rating_key = h.rating_key AND m.deleted_at IS NULL
        WHERE p.enabled = true
          AND (h.history_key IS NULL OR e.rating_key IS NOT NULL OR m.rating_key IS NOT NULL)
        GROUP BY p.id
     )
     SELECT v.profile_id,
            coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(a.name), ''), '이름 없음')
              AS name,
            CASE
              WHEN t.profile_id IS NULL THEN '처음'
              WHEN t.prompt_version <> $1 THEN '판 바뀜'
              ELSE '기록 ' || (v.views - t.view_count) || '편 늘어남'
            END AS reason
       FROM views v
       JOIN profile pr ON pr.id = v.profile_id
       LEFT JOIN plex_account a ON a.id = pr.plex_account_id
       LEFT JOIN profile_taste t ON t.profile_id = v.profile_id
      WHERE v.views > 0
        AND (t.profile_id IS NULL OR t.prompt_version <> $1 OR t.view_count <> v.views)
      ORDER BY v.views DESC
      LIMIT $2`,
    [TASTE_PROMPT_VERSION, MAX_PER_RUN],
  )

  if (stale.length === 0) return { done: 0, failed: 0 }

  let done = 0
  let failed = 0
  for (const row of stale) {
    try {
      const started = Date.now()
      const result = await generateTaste(row.profile_id)
      done += 1
      console.log(
        `[taste] ${row.name} 갱신 (${row.reason}) — 추천 ${result.picks.length}편 · ` +
          `장르 줄 ${result.genrePicks.length}개 · ${Date.now() - started}ms`,
      )
    } catch (error) {
      if (error instanceof NotEnoughHistoryError) continue
      failed += 1
      console.error(`[taste] ${row.name} 실패:`, error)
    }
  }
  return { done, failed }
}
