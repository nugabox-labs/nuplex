import 'server-only'
import { db, query, queryOne } from '@/lib/db'
import { sendChatPush } from '@/lib/devices'
import { PROFILE_NAME_SQL } from '@/lib/profiles'

// 채팅 — 프로필끼리 주고받는 1:1 대화(database/0006_chat.sql).
//
// 상대는 "켜져 있는 프로필" 이다. 별도 권한은 걸지 않는다 — 관문은 프로필 하나이고
// (첫 진입 때 가입 이메일 확인), 여기서는 신원 표시로만 쓴다(AGENTS.md §2).
//
// 새 메시지는 두 갈래로 알린다.
//   · 웹  — Postgres NOTIFY → /api/chat/stream 의 SSE
//   · 앱  — FCM 푸시(type: 'chat'). 계약은 docs/CHAT.md
// 웹이 켜져 있든 아니든 둘 다 나간다. 켜져 있는지를 서버가 알 방법이 없고, 알려고
// 접속 상태를 관리하기 시작하면 구조가 한 단계 더 복잡해진다.

/** SSE 가 듣는 Postgres 채널 이름. */
export const CHAT_CHANNEL = 'nuplex_chat'

export interface ChatPartner {
  id: number
  name: string
  avatar: string | null
  /** NUGA 처럼 Plex 서버 주인인 계정. 화면에 관리자 뱃지를 단다 */
  isAdmin: boolean
}

export interface Conversation {
  id: string
  partner: ChatPartner
  lastMessage: string | null
  lastMessageAt: string
  unread: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: number
  body: string
  createdAt: string
}

const PARTNER_SELECT = `
  SELECT p.id, ${PROFILE_NAME_SQL} AS name, a.avatar_file, coalesce(a.is_admin, false) AS is_admin
    FROM profile p
    LEFT JOIN plex_account a ON a.id = p.plex_account_id AND a.deleted_at IS NULL
`

interface PartnerRow {
  id: number
  name: string
  avatar_file: string | null
  is_admin: boolean
}

function toPartner(row: PartnerRow): ChatPartner {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar_file ? `/media/${row.avatar_file}` : null,
    isAdmin: row.is_admin,
  }
}

/** "메시지 보내기" 에서 고를 상대. 켜져 있는 프로필 중 나를 뺀 전부. */
export async function listPartners(profileId: number): Promise<ChatPartner[]> {
  const rows = await query<PartnerRow>(
    `${PARTNER_SELECT}
      WHERE p.enabled = true AND p.id <> $1
      ORDER BY coalesce(a.is_admin, false) DESC, p.sort_order, p.id`,
    [profileId],
  )
  return rows.map(toPartner)
}

/**
 * "관리자에게 작품 신청하기" 가 말을 걸 상대. NUGA 가 여기 해당한다.
 *
 * 관리자가 여럿이면 목록에서 맨 앞에 오는 한 명이다. 관리자가 없거나 내가 그 관리자면
 * null 이고, 화면은 그때 버튼을 감춘다 — 자기 자신에게 신청하는 버튼은 의미가 없다.
 */
export async function findAdminPartner(profileId: number): Promise<ChatPartner | null> {
  const row = await queryOne<PartnerRow>(
    `${PARTNER_SELECT}
      WHERE p.enabled = true AND p.id <> $1 AND coalesce(a.is_admin, false) = true
      ORDER BY p.sort_order, p.id
      LIMIT 1`,
    [profileId],
  )
  return row ? toPartner(row) : null
}

/**
 * 내 대화 목록. 최근에 말이 오간 순서.
 *
 * 안 읽은 수는 conversation_read 에 적어둔 마지막 읽은 메시지 이후로 센다 —
 * 알림 종처럼 브라우저에만 두면 폰과 PC 가 서로 다른 배지를 보여준다.
 */
export async function listConversations(profileId: number): Promise<Conversation[]> {
  const rows = await query<PartnerRow & {
    conversation_id: string
    last_message: string | null
    last_message_at: Date
    unread: string
  }>(
    `SELECT c.id AS conversation_id, c.last_message_at,
            p.id, ${PROFILE_NAME_SQL} AS name, a.avatar_file,
            coalesce(a.is_admin, false) AS is_admin,
            (SELECT m.body FROM message m
              WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT count(*) FROM message m
              WHERE m.conversation_id = c.id AND m.sender_id <> $1
                AND m.id > coalesce(r.last_read_message_id, 0)) AS unread
       FROM conversation c
       -- 두 자리 중 내가 아닌 쪽이 상대다
       JOIN profile p
         ON p.id = CASE WHEN c.profile_a_id = $1 THEN c.profile_b_id ELSE c.profile_a_id END
       LEFT JOIN plex_account a ON a.id = p.plex_account_id AND a.deleted_at IS NULL
       LEFT JOIN conversation_read r ON r.conversation_id = c.id AND r.profile_id = $1
      WHERE c.profile_a_id = $1 OR c.profile_b_id = $1
      ORDER BY c.last_message_at DESC`,
    [profileId],
  )

  return rows.map((row) => ({
    id: String(row.conversation_id),
    partner: toPartner(row),
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at.toISOString(),
    unread: Number(row.unread),
  }))
}

/**
 * 상대와의 대화방. 없으면 만든다.
 *
 * 두 프로필 id 를 정렬해서 넣는 것이 핵심이다 — (3,7) 과 (7,3) 이 같은 방이 되고,
 * UNIQUE 제약이 동시 요청에서도 방이 둘 생기는 것을 막는다.
 */
export async function getOrCreateConversation(
  profileId: number,
  partnerId: number,
): Promise<string | null> {
  if (profileId === partnerId) return null

  // 켜져 있는 프로필에게만 말을 걸 수 있다. 꺼진 프로필은 선택 화면에도 없다.
  const partner = await queryOne<{ id: number }>(
    `SELECT id FROM profile WHERE id = $1 AND enabled = true`,
    [partnerId],
  )
  if (!partner) return null

  const [low, high] = profileId < partnerId ? [profileId, partnerId] : [partnerId, profileId]
  const row = await queryOne<{ id: string }>(
    `INSERT INTO conversation (profile_a_id, profile_b_id) VALUES ($1, $2)
     ON CONFLICT (profile_a_id, profile_b_id) DO UPDATE SET profile_a_id = EXCLUDED.profile_a_id
     RETURNING id`,
    [low, high],
  )
  return row ? String(row.id) : null
}

/** 이 대화의 두 참가자. 내가 낀 대화가 맞는지 확인하는 데도 쓴다. */
async function participants(conversationId: string): Promise<[number, number] | null> {
  const row = await queryOne<{ profile_a_id: number; profile_b_id: number }>(
    `SELECT profile_a_id, profile_b_id FROM conversation WHERE id = $1`,
    [conversationId],
  )
  return row ? [row.profile_a_id, row.profile_b_id] : null
}

/** 대화 내용. 내가 참가자가 아니면 null 이다(남의 대화를 id 만으로 열 수 없다). */
export async function listMessages(
  conversationId: string,
  profileId: number,
  limit = 200,
): Promise<ChatMessage[] | null> {
  const pair = await participants(conversationId)
  if (!pair || !pair.includes(profileId)) return null

  const rows = await query<{
    id: string
    conversation_id: string
    sender_id: number
    body: string
    created_at: Date
  }>(
    `SELECT id, conversation_id, sender_id, body, created_at
       FROM message WHERE conversation_id = $1
      ORDER BY id DESC LIMIT $2`,
    [conversationId, limit],
  )

  // 최근 것부터 잘라 온 뒤 화면 순서(오래된 것 → 최근)로 뒤집는다.
  return rows.reverse().map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  }))
}

/** 여기까지 읽었다고 적는다. 대화를 열거나 새 메시지를 볼 때 부른다. */
export async function markRead(conversationId: string, profileId: number): Promise<void> {
  await db.query(
    `INSERT INTO conversation_read (conversation_id, profile_id, last_read_message_id)
     SELECT $1, $2, coalesce(max(id), 0) FROM message WHERE conversation_id = $1
     ON CONFLICT (conversation_id, profile_id) DO UPDATE SET
       last_read_message_id = EXCLUDED.last_read_message_id, updated_at = now()`,
    [conversationId, profileId],
  )
}

/**
 * 메시지를 보낸다. 저장 → 웹 알림(NOTIFY) → 앱 푸시 순서다.
 * 푸시가 실패해도 메시지는 이미 남아 있다 — 발송 실패로 대화를 잃지 않게 한다.
 */
export async function sendMessage(
  conversationId: string,
  senderId: number,
  body: string,
): Promise<ChatMessage | null> {
  const pair = await participants(conversationId)
  if (!pair || !pair.includes(senderId)) return null
  const recipientId = pair[0] === senderId ? pair[1] : pair[0]

  const row = await queryOne<{ id: string; created_at: Date }>(
    `INSERT INTO message (conversation_id, sender_id, body) VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [conversationId, senderId, body],
  )
  if (!row) return null

  await db.query(`UPDATE conversation SET last_message_at = now() WHERE id = $1`, [conversationId])
  // 보낸 사람은 방금 자기가 쓴 것까지 읽은 상태다.
  await markRead(conversationId, senderId)

  const message: ChatMessage = {
    id: String(row.id),
    conversationId,
    senderId,
    body,
    createdAt: row.created_at.toISOString(),
  }

  // 페이로드에는 식별자만 싣는다. NOTIFY 는 8000바이트 제한이 있어서 본문을 그대로
  // 넣으면 긴 메시지에서 발송이 통째로 실패한다 — 받은 쪽이 다시 읽어 가게 한다.
  await db.query(`SELECT pg_notify($1, $2)`, [
    CHAT_CHANNEL,
    JSON.stringify({ conversationId, messageId: message.id, participants: pair, senderId }),
  ])

  const sender = await queryOne<PartnerRow>(`${PARTNER_SELECT} WHERE p.id = $1`, [senderId])
  await sendChatPush(recipientId, {
    title: sender?.name ?? '새 메시지',
    body,
    conversationId,
  })

  return message
}
