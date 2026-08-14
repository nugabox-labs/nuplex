'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Film, MessageCircle, PenSquare, Send, Users, X } from 'lucide-react'
import type { ChatPartner, ChatMessage, Conversation } from '@/lib/chat'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// 상단 채팅 아이콘과 그 모달. 화면은 셋이고 모달 안에서만 오간다.
//   목록 → 상대 고르기 → 대화
//
// 새 메시지는 SSE(/api/chat/stream)로 받는다. 모달을 닫아도 구독은 유지한다 —
// 배지가 실시간으로 늘어나야 알림을 받은 티가 난다.

type View =
  | { kind: 'list' }
  | { kind: 'compose' }
  | { kind: 'room'; conversationId: string; partner: ChatPartner; draft?: string }

/**
 * "관리자에게 작품 신청하기" 를 누르면 입력창에 미리 채워지는 뼈대.
 *
 * 빈 칸에서 시작하면 "그 드라마 좀 올려주세요" 한 줄이 오고 관리자가 다시 되물어야 한다.
 * 형식을 미리 채워 두면 한 번에 필요한 것이 온다.
 */
const REQUEST_TEMPLATE = [
  '종류 : 영화/드라마/예능 등',
  '제목 : ',
  '내용 : 원하는 회차, 개봉/방영 시기 등 전달이 필요한 내용을 입력해주세요',
].join('\n')

/** SSE 로 오는 신호. 식별자만 온다 — 본문은 받은 쪽이 다시 읽는다(lib/chat.ts). */
interface ChatEvent {
  conversationId: string
  messageId: string
}

export function ChatPanel({ adminSelf = false }: { adminSelf?: boolean }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [admin, setAdmin] = useState<ChatPartner | null>(null)
  const [unread, setUnread] = useState(0)
  const [myId, setMyId] = useState<number | null>(null)
  const [lastEvent, setLastEvent] = useState<ChatEvent | null>(null)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/chat')
    if (!res.ok) return
    const data = (await res.json()) as {
      profileId: number
      conversations: Conversation[]
      admin: ChatPartner | null
      unread: number
    }
    setMyId(data.profileId)
    setConversations(data.conversations)
    setAdmin(data.admin)
    setUnread(data.unread)
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // 새 메시지 신호. 페이로드에는 식별자만 오므로 실제 내용은 다시 읽어 온다.
  // 연결은 여기 하나만 연다 — 연결 하나가 pg 커넥션 하나라, 대화 화면이 따로 열면
  // 같은 사람이 두 개를 물고 있게 된다. 대화 화면에는 마지막 신호를 내려보낸다.
  useEffect(() => {
    const source = new EventSource('/api/chat/stream')
    source.addEventListener('message', (event) => {
      setLastEvent(JSON.parse((event as MessageEvent).data) as ChatEvent)
      void loadConversations()
    })
    return () => source.close()
  }, [loadConversations])

  // 푸시를 눌러 들어온 경우. 셸이 `/?chat=12` 로 웹뷰를 열면 그 대화를 바로 띄운다
  // (docs/CHAT.md §4). 목록을 한 번 받아야 상대가 누구인지 알 수 있어 여기서 처리한다.
  const openedFromUrl = useRef(false)
  useEffect(() => {
    if (openedFromUrl.current || conversations.length === 0) return
    const id = new URLSearchParams(window.location.search).get('chat')
    const conversation = conversations.find((c) => c.id === id)
    if (!conversation) return

    openedFromUrl.current = true
    setView({ kind: 'room', conversationId: conversation.id, partner: conversation.partner })
    setOpen(true)
  }, [conversations])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  /** 상대와의 방을 열고(없으면 만들고) 그 화면으로 간다. draft 는 입력창 초기값이다. */
  async function openRoom(partner: ChatPartner, draft?: string) {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerId: partner.id }),
    })
    if (!res.ok) return
    const { conversationId } = (await res.json()) as { conversationId: string }
    setView({ kind: 'room', conversationId, partner, draft })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setView({ kind: 'list' })
          void loadConversations()
        }}
        aria-label={unread > 0 ? `채팅 ${unread}건` : '채팅'}
        className="relative flex items-center justify-center rounded-full border border-border bg-secondary/60 p-2 text-foreground transition hover:bg-secondary hover:text-primary"
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="채팅"
            className="fixed inset-0 z-[70] flex items-start justify-center bg-background/80 p-4 backdrop-blur-md md:p-10"
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[70vh] max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                {view.kind === 'list' ? (
                  <MessageCircle className="h-5 w-5 text-primary" />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setView({ kind: 'list' })
                      void loadConversations()
                    }}
                    aria-label="뒤로"
                    className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <h2 className="flex-1 truncate font-bold text-foreground">
                  {view.kind === 'list'
                    ? '채팅'
                    : view.kind === 'compose'
                      ? '메시지 보내기'
                      : view.partner.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="닫기"
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {view.kind === 'list' ? (
                <ConversationList
                  conversations={conversations}
                  admin={admin}
                  adminSelf={adminSelf}
                  onCompose={() => setView({ kind: 'compose' })}
                  onRequest={(partner) => void openRoom(partner, REQUEST_TEMPLATE)}
                  onOpen={(conversation) =>
                    setView({
                      kind: 'room',
                      conversationId: conversation.id,
                      partner: conversation.partner,
                    })
                  }
                />
              ) : view.kind === 'compose' ? (
                <PartnerPicker onPick={openRoom} />
              ) : (
                <Room
                  conversationId={view.conversationId}
                  partner={view.partner}
                  initialDraft={view.draft}
                  myId={myId}
                  lastEvent={lastEvent}
                  onSent={loadConversations}
                />
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

function Avatar({ partner, size = 'md' }: { partner: ChatPartner; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-bold text-muted-foreground',
        size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm',
      )}
    >
      {partner.avatar ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={partner.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        partner.name.slice(0, 1)
      )}
    </span>
  )
}

function AdminBadge() {
  return (
    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
      관리자
    </span>
  )
}

function ConversationList({
  conversations,
  admin,
  adminSelf,
  onCompose,
  onRequest,
  onOpen,
}: {
  conversations: Conversation[]
  /** 작품을 신청할 관리자. 없으면 신청 버튼을 감춘다 */
  admin: ChatPartner | null
  /** 내가 그 관리자인 경우. 버튼은 보여주되 누를 수는 없다 */
  adminSelf?: boolean
  onCompose: () => void
  onRequest: (admin: ChatPartner) => void
  onOpen: (conversation: Conversation) => void
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            아직 주고받은 메시지가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onOpen(conversation)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-secondary/60"
                >
                  <Avatar partner={conversation.partner} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {conversation.partner.name}
                      </span>
                      {conversation.partner.isAdmin ? <AdminBadge /> : null}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {conversation.lastMessage ?? '대화를 시작해 보세요.'}
                    </span>
                  </span>
                  {conversation.unread > 0 ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {conversation.unread > 9 ? '9+' : conversation.unread}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border p-3">
        <button
          type="button"
          onClick={onCompose}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
        >
          <PenSquare className="h-4 w-4" />
          메시지 보내기
        </button>

        {/* 상대를 고르는 단계를 건너뛰고 관리자와의 방으로 바로 간다. 가장 잦은 용건이라
            "메시지 보내기 → 목록에서 NUGA 찾기 → 형식 없이 쓰기" 를 한 번으로 줄인다. */}
        {admin ? (
          <button
            type="button"
            onClick={() => onRequest(admin)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <Film className="h-4 w-4" />
            관리자에게 작품 신청하기
          </button>
        ) : adminSelf ? (
          /* 관리자 본인에게는 신청할 상대가 없다. 다른 사람 화면에 이 버튼이 어떻게
             보이는지 확인할 수 있게 자리만 남기고 누르지는 못하게 둔다. */
          <div>
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold text-foreground"
            >
              <Film className="h-4 w-4" />
              관리자에게 작품 신청하기
            </button>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              관리자 본인이라 신청할 상대가 없습니다
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}

function PartnerPicker({ onPick }: { onPick: (partner: ChatPartner) => void }) {
  const [partners, setPartners] = useState<ChatPartner[]>([])

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/chat/partners')
      if (!res.ok) return
      const data = (await res.json()) as { partners: ChatPartner[] }
      setPartners(data.partners)
    })()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <p className="px-5 pt-4 text-sm text-muted-foreground">지금 켜져 있는 프로필입니다.</p>

      <ul className="mt-2 divide-y divide-border/60">
        {partners.map((partner) => (
          <li key={partner.id}>
            <button
              type="button"
              onClick={() => onPick(partner)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-secondary/60"
            >
              <Avatar partner={partner} />
              <span className="truncate font-semibold text-foreground">{partner.name}</span>
              {partner.isAdmin ? <AdminBadge /> : null}
            </button>
          </li>
        ))}
      </ul>

      {/* 지금은 1:1 만 만든다 */}
      <div className="m-5 flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <Users className="h-4 w-4 shrink-0" />
        여러 명이 함께하는 그룹 채팅은 준비 중입니다.
      </div>
    </div>
  )
}

function Room({
  conversationId,
  partner,
  initialDraft,
  myId,
  lastEvent,
  onSent,
}: {
  conversationId: string
  partner: ChatPartner
  /** 입력창에 미리 채워 둘 내용. 작품 신청처럼 형식이 있는 메시지에 쓴다 */
  initialDraft?: string
  myId: number | null
  lastEvent: ChatEvent | null
  onSent: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState(initialDraft ?? '')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 미리 채워 넣었으면 커서를 입력창에 둔다. 곧바로 이어 쓸 수 있어야 한다.
  useEffect(() => {
    if (!initialDraft) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }, [initialDraft])

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/messages?conversationId=${conversationId}`)
    if (!res.ok) return
    const data = (await res.json()) as { messages: ChatMessage[] }
    setMessages(data.messages)
  }, [conversationId])

  useEffect(() => {
    void load()
  }, [load])

  // 열어둔 동안 들어온 메시지. 이 대화 것만 다시 읽는다.
  useEffect(() => {
    if (lastEvent?.conversationId === conversationId) void load()
  }, [lastEvent, conversationId, load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, body }),
    })
    if (res.ok) {
      setDraft('')
      await load()
      onSent()
    }
    setSending(false)
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {partner.name} 님에게 첫 메시지를 보내 보세요.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.senderId === myId
            return (
              <div
                key={message.id}
                className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}
              >
                {mine ? null : <Avatar partner={partner} size="sm" />}
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                    mine
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-secondary text-foreground',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                </div>
                <time className="shrink-0 pb-0.5 text-[10px] text-muted-foreground">
                  {formatRelativeTime(message.createdAt)}
                </time>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter 로 보내고 Shift+Enter 로 줄을 바꾼다.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          // 여러 줄짜리 초안(작품 신청 등)이 한 줄 창에 갇히지 않게 줄 수를 따라간다.
          // 위쪽은 max-h-32 가 잡으므로 넷까지만 늘린다.
          rows={Math.min(4, draft.split('\n').length)}
          placeholder="메시지를 입력하세요"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || draft.trim().length === 0}
          aria-label="보내기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </>
  )
}
