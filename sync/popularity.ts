import { db } from '@/lib/db'

// 인기 점수 — media_item.popularity 를 다시 센다(database/0017_popularity.sql).
//
// 기준은 **본 사람 수**다. 전체 기간의 시청 기록에서 계정 수를 세고, 한 사람이 같은
// 작품을 몇 번을 봤든 1로 친다. 에피소드 기록은 시리즈로 접는다.
//
// Plex 를 부르지 않는다. 이미 받아둔 watch_history 만 읽으므로 증분 동기화마다 돌려도
// 값이 싸다 — 조회 한 번이고, 실제로 달라진 행만 쓴다.

export async function refreshPopularity(): Promise<number> {
  const result = await db.query(
    `WITH viewers AS (
       SELECT COALESCE(h.show_rating_key, h.rating_key) AS rating_key,
              COUNT(DISTINCT h.plex_account_id)::int AS people
         FROM watch_history h
        GROUP BY 1
     )
     UPDATE media_item m
        SET popularity = COALESCE(v.people, 0)
       FROM media_item base
       LEFT JOIN viewers v ON v.rating_key = base.rating_key
      WHERE m.rating_key = base.rating_key
        AND m.popularity IS DISTINCT FROM COALESCE(v.people, 0)`,
  )
  return result.rowCount ?? 0
}
