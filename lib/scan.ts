import 'server-only'
import { db, queryOne } from '@/lib/db'

// 스캔 즐겨찾기 — 관리자가 자주 훑는 라이브러리 묶음.
//
// 표를 새로 만들지 않고 sync_state(키 · 값) 에 한 줄로 넣는다. 관리자 한 사람의
// 편의값이라 프로필별로 나눌 이유가 없고, 잃어버려도 체크를 다시 하면 그만이다
// (sync_state 는 백업 대상이 아니다 — AGENTS §2 의 백업 목록을 늘리지 않으려는 선택).

const KEY = 'scan_favorites'

export async function getScanFavorites(): Promise<number[]> {
  const row = await queryOne<{ value: string | null }>(
    `SELECT value FROM sync_state WHERE key = $1`,
    [KEY],
  )
  return (row?.value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
}

export async function setScanFavorites(ids: number[]): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, ids.join(',')],
  )
}
