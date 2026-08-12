import 'server-only'
import { db, query, queryOne } from '@/lib/db'

// 알림(공지). 이 앱에서 사람이 만드는 유일한 데이터다 — 동기화로 복구되지 않는다.
// 한 행이 그대로 푸시 알림 한 건이 된다(title = 푸시 제목, body = 푸시 본문).

export interface Notice {
  id: string
  title: string
  body: string
  publishedAt: string
  /** 대상 프로필. 비어 있으면 전체 발송 */
  targetProfileIds?: number[]
}

interface NoticeRow {
  id: string
  title: string
  body: string
  published_at: Date
}

function toNotice(row: NoticeRow): Notice {
  return {
    id: String(row.id),
    title: row.title,
    body: row.body,
    publishedAt: row.published_at.toISOString(),
  }
}

/**
 * 이 프로필이 볼 알림. 대상이 지정된 알림은 그 프로필에게만 보인다.
 * profileId 가 없으면(프로필 미선택) 전체 발송분만 본다.
 */
export async function listNoticesFor(profileId: number | null, limit = 30): Promise<Notice[]> {
  const rows = await query<NoticeRow>(
    `SELECT n.id, n.title, n.body, n.published_at
       FROM notice n
      WHERE NOT EXISTS (SELECT 1 FROM notice_target t WHERE t.notice_id = n.id)
         OR ($1::int IS NOT NULL AND EXISTS (
              SELECT 1 FROM notice_target t WHERE t.notice_id = n.id AND t.profile_id = $1
            ))
      ORDER BY n.published_at DESC, n.id DESC LIMIT $2`,
    [profileId, limit],
  )
  return rows.map(toNotice)
}

/** 관리자용 — 대상까지 함께. */
export async function listNotices(limit = 30): Promise<Notice[]> {
  const rows = await query<NoticeRow & { target_profile_ids: number[] | null }>(
    `SELECT n.id, n.title, n.body, n.published_at,
            ARRAY(SELECT profile_id FROM notice_target WHERE notice_id = n.id) AS target_profile_ids
       FROM notice n
      ORDER BY n.published_at DESC, n.id DESC LIMIT $1`,
    [limit],
  )
  return rows.map((row) => ({
    ...toNotice(row),
    targetProfileIds: row.target_profile_ids ?? [],
  }))
}

/** 알림을 만든다. targetProfileIds 가 비어 있으면 전체 발송이다. */
export async function createNotice(
  title: string,
  body: string,
  targetProfileIds: number[] = [],
): Promise<Notice> {
  const row = await queryOne<NoticeRow>(
    `INSERT INTO notice (title, body) VALUES ($1, $2)
     RETURNING id, title, body, published_at`,
    [title, body],
  )
  const notice = toNotice(row!)

  for (const profileId of targetProfileIds) {
    await db.query(
      `INSERT INTO notice_target (notice_id, profile_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [notice.id, profileId],
    )
  }
  return { ...notice, targetProfileIds }
}

export async function deleteNotice(id: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM notice WHERE id = $1`, [id])
  return (result.rowCount ?? 0) > 0
}

// --- 초안 자동 생성 ----------------------------------------------------------
// 최근 추가된 작품을 Plex 섹션별로 묶어 카카오톡에 보내던 형식 그대로 만든다.
// 이미 DB 에 있는 데이터라 Plex 를 다시 부르지 않는다.

// 섹션 이름 앞에 붙일 이모지. 못 찾으면 기본값을 쓴다.
const SECTION_EMOJI: { match: RegExp; emoji: string }[] = [
  { match: /^영화/, emoji: '🎥' },
  { match: /^드라마/, emoji: '📺' },
  { match: /^애니/, emoji: '🔮' },
  { match: /^예능/, emoji: '🧨' },
  { match: /^다큐/, emoji: '🎬' },
]

function emojiFor(sectionTitle: string): string {
  return SECTION_EMOJI.find((e) => e.match.test(sectionTitle))?.emoji ?? '🎞️'
}

/** 섹션 제목 "영화 | 한국" 을 알림에 쓸 "한국 영화" 로 뒤집는다. */
function noticeSectionLabel(sectionTitle: string): string {
  const [group, sub] = sectionTitle.split('|').map((part) => part.trim())
  return sub ? `${sub} ${group}` : group
}

export async function buildDraft(days = 7): Promise<{ title: string; body: string }> {
  const rows = await query<{
    section_title: string
    title: string
    year: number | null
  }>(
    `SELECT s.title AS section_title, m.title, m.year
       FROM media_item m
       JOIN library_section s ON s.id = m.section_id
      WHERE m.deleted_at IS NULL
        AND m.plex_added_at >= now() - ($1 || ' days')::interval
      ORDER BY s.id, m.plex_added_at DESC`,
    [String(days)],
  )

  const lines: string[] = ['최근 업로드된 작품을 알려드립니다 ☺️']
  let currentSection: string | null = null

  for (const row of rows) {
    if (row.section_title !== currentSection) {
      currentSection = row.section_title
      lines.push('', `${emojiFor(currentSection)} ${noticeSectionLabel(currentSection)}`)
    }
    lines.push(`- ${row.title}${row.year ? ` (${row.year})` : ''}`)
  }

  if (rows.length === 0) {
    lines.push('', `최근 ${days}일 사이에 새로 들어온 작품이 없습니다.`)
  }

  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  })
  return { title: `${today} 업데이트`, body: lines.join('\n') }
}
