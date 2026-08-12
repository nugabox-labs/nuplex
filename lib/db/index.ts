import { Pool, type QueryResultRow } from 'pg'

// 모듈 로드 시점에 연결하면 DATABASE_URL 이 없는 빌드 환경에서 `next build` 의
// "Collecting page data" 단계가 이 모듈을 import 만 해도 죽는다.
// 첫 실제 쿼리까지 연결을 미루는 Proxy 로 감싼다 — AGENTS.md §4
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL 이 설정되지 않았습니다.')
    }
    pool = new Pool({ connectionString, max: 10 })
  }
  return pool
}

export const db = new Proxy({} as Pool, {
  get(_target, prop) {
    const value = Reflect.get(getPool(), prop)
    return typeof value === 'function' ? value.bind(getPool()) : value
  },
})

/** 여러 행을 읽는다. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(text, params)
  return result.rows
}

/** 한 행만 읽는다. 없으면 null. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
