import 'server-only'
import { db, query, queryOne } from '@/lib/db'

// 프로필 — "지금 보는 사람이 누구인가".
//
// plex_account 는 Plex 사본이고, profile 은 우리가 관리하는 층이다.
// 선택 화면에는 관리자가 켠 프로필만 나온다.

export interface Profile {
  id: number
  name: string
  avatar: string | null
  /** 첫 진입 확인에 쓸 이메일이 등록돼 있는지 */
  hasEmail: boolean
  /** 힌트로 보여줄 가린 이메일. 본인은 알아보되 남에게는 단서가 안 되게 한다 */
  maskedEmail: string | null
}

/** 관리자 화면에서만 쓰는, 이메일까지 보이는 형태. */
export interface AdminProfile extends Profile {
  plexAccountId: number | null
  plexName: string | null
  username: string | null
  email: string | null
  emailOverride: string | null
  displayName: string | null
  enabled: boolean
  sortOrder: number
  sources: string[]
  isAdmin: boolean
}

interface ProfileRow {
  id: number
  plex_account_id: string | null
  display_name: string | null
  email_override: string | null
  enabled: boolean
  sort_order: number
  plex_name: string | null
  username: string | null
  plex_email: string | null
  avatar_file: string | null
  is_home: boolean | null
  is_friend: boolean | null
  is_server: boolean | null
  is_admin: boolean | null
}

const PROFILE_SELECT = `
  SELECT p.id, p.plex_account_id, p.display_name, p.email_override, p.enabled, p.sort_order,
         a.name AS plex_name, a.username, a.email AS plex_email, a.avatar_file,
         a.is_home, a.is_friend, a.is_server, a.is_admin
    FROM profile p
    LEFT JOIN plex_account a ON a.id = p.plex_account_id AND a.deleted_at IS NULL
`

function displayName(row: ProfileRow): string {
  return row.display_name?.trim() || row.plex_name?.trim() || row.username?.trim() || '이름 없음'
}

/** 이 프로필을 확인할 때 쓸 이메일. 관리자가 보정한 값이 Plex 값보다 우선한다. */
function effectiveEmail(row: ProfileRow): string | null {
  return row.email_override?.trim() || row.plex_email?.trim() || null
}

/**
 * `gongdo4@gmail.com` → `g******@g******`
 *
 * 별 개수를 실제 길이에 맞추지 않는다. 길이도 단서가 되기 때문에 항상 6개로 고정한다.
 */
function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split('@')
  if (!local || !domain) return null
  return `${local[0]}${'*'.repeat(6)}@${domain[0]}${'*'.repeat(6)}`
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: displayName(row),
    avatar: row.avatar_file ? `/media/${row.avatar_file}` : null,
    hasEmail: effectiveEmail(row) !== null,
    maskedEmail: maskEmail(effectiveEmail(row)),
  }
}

/** 선택 화면에 뿌릴 목록. 켜진 것만. */
export async function listEnabledProfiles(): Promise<Profile[]> {
  const rows = await query<ProfileRow>(
    `${PROFILE_SELECT} WHERE p.enabled = true ORDER BY p.sort_order, p.id`,
  )
  return rows.map(toProfile)
}

export async function getProfile(id: number): Promise<Profile | null> {
  const row = await queryOne<ProfileRow>(
    `${PROFILE_SELECT} WHERE p.id = $1 AND p.enabled = true`,
    [id],
  )
  return row ? toProfile(row) : null
}

/**
 * 첫 진입 확인. 그 프로필의 가입 이메일이 맞아야 통과한다.
 *
 * 별도 PIN 을 두지 않은 이유가 여기 있다 — 본인만 아는 값이면서 관리자가 따로
 * 나눠줄 필요가 없다. 대소문자와 앞뒤 공백은 무시한다.
 */
export async function verifyProfileEmail(id: number, email: string): Promise<boolean> {
  const row = await queryOne<ProfileRow>(
    `${PROFILE_SELECT} WHERE p.id = $1 AND p.enabled = true`,
    [id],
  )
  if (!row) return false

  const expected = effectiveEmail(row)
  if (!expected) return false
  return expected.toLowerCase() === email.trim().toLowerCase()
}

// --- 관리자 -----------------------------------------------------------------

function toAdminProfile(row: ProfileRow): AdminProfile {
  const sources: string[] = []
  if (row.is_home) sources.push('home')
  if (row.is_friend) sources.push('friend')
  if (row.is_server) sources.push('server')

  return {
    ...toProfile(row),
    plexAccountId: row.plex_account_id ? Number(row.plex_account_id) : null,
    plexName: row.plex_name,
    username: row.username,
    email: effectiveEmail(row),
    emailOverride: row.email_override,
    displayName: row.display_name,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    sources,
    isAdmin: Boolean(row.is_admin),
  }
}

export async function listAllProfiles(): Promise<AdminProfile[]> {
  const rows = await query<ProfileRow>(
    `${PROFILE_SELECT}
      ORDER BY p.enabled DESC, p.sort_order, a.is_home DESC NULLS LAST, a.name`,
  )
  return rows.map(toAdminProfile)
}

export async function updateProfile(
  id: number,
  patch: { displayName?: string | null; emailOverride?: string | null; enabled?: boolean; sortOrder?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await queryOne<ProfileRow>(`${PROFILE_SELECT} WHERE p.id = $1`, [id])
  if (!current) return { ok: false, error: '없는 프로필입니다.' }

  const nextOverride =
    patch.emailOverride !== undefined ? patch.emailOverride?.trim() || null : current.email_override
  const willHaveEmail = (nextOverride || current.plex_email?.trim() || null) !== null

  // 이메일이 없으면 첫 진입 확인을 통과할 방법이 없다. 켜지지 않게 막는다 —
  // 켜두면 선택 화면에는 뜨는데 아무도 못 들어가는 막다른 길이 된다.
  if ((patch.enabled ?? current.enabled) && !willHaveEmail) {
    return { ok: false, error: '이메일이 없는 프로필은 켤 수 없습니다. 이메일을 먼저 입력해 주세요.' }
  }

  // 최종 값을 먼저 정하고 통째로 쓴다. COALESCE 로 처리하면 "빈 값으로 되돌리기" 가
  // 안 된다 — 이름을 지우려고 빈 문자열을 보내도 옛 값이 남는다.
  const nextDisplayName =
    patch.displayName !== undefined ? patch.displayName?.trim() || null : current.display_name

  await db.query(
    `UPDATE profile SET
       display_name = $2, email_override = $3, enabled = $4, sort_order = $5, updated_at = now()
     WHERE id = $1`,
    [
      id,
      nextDisplayName,
      nextOverride,
      patch.enabled ?? current.enabled,
      patch.sortOrder ?? current.sort_order,
    ],
  )
  return { ok: true }
}
