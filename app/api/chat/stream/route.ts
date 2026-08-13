import { type NextRequest } from 'next/server'
import { Client } from 'pg'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { CHAT_CHANNEL } from '@/lib/chat'

// 실시간 채팅의 수신 쪽. 메시지를 저장할 때 보낸 Postgres NOTIFY 를 그대로 SSE 로 흘린다.
//
// 웹소켓을 쓰지 않은 이유: 필요한 건 서버 → 브라우저 한 방향뿐이다. 보내는 쪽은
// 평범한 POST 로 충분하고, SSE 는 역방향 프록시를 그냥 통과한다.
//
// 연결마다 pg 커넥션을 하나 잡는다. LISTEN 은 커넥션에 붙는 상태라 풀에서 빌려 쓸 수
// 없다 — 풀에 돌려주는 순간 다음 사람이 남의 알림을 받는다. 지인 몇 명이 쓰는
// 서비스라 이 비용은 감당된다.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 프록시가 조용한 연결을 끊지 않게 주기적으로 주석 한 줄을 흘린다.
const HEARTBEAT_MS = 25_000

export async function GET(request: NextRequest) {
  const profileId = await readProfileValue(request.cookies.get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return new Response('프로필을 먼저 골라 주세요.', { status: 401 })
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return new Response('DATABASE_URL 이 설정되지 않았습니다.', { status: 500 })
  }

  const client = new Client({ connectionString })
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let heartbeat: ReturnType<typeof setInterval> | undefined

      const send = (text: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          // 브라우저가 이미 끊었다. 아래 cleanup 이 정리한다.
        }
      }

      const cleanup = async () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        await client.end().catch(() => {})
        try {
          controller.close()
        } catch {
          // 이미 닫혔다
        }
      }

      client.on('notification', (event) => {
        if (event.channel !== CHAT_CHANNEL || !event.payload) return
        const payload = JSON.parse(event.payload) as {
          participants: number[]
        }
        // 내가 낀 대화만 흘린다. 페이로드에 식별자밖에 없어도 남의 대화가 도착하면
        // "새 메시지가 있다" 는 사실 자체가 새어 나간다.
        if (!payload.participants?.includes(profileId)) return
        send(`event: message\ndata: ${event.payload}\n\n`)
      })
      // 연결이 죽으면 브라우저가 EventSource 로 알아서 다시 붙는다.
      client.on('error', () => void cleanup())

      try {
        await client.connect()
        await client.query(`LISTEN ${CHAT_CHANNEL}`)
      } catch {
        await cleanup()
        return
      }

      send(': connected\n\n')
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)
      request.signal.addEventListener('abort', () => void cleanup())
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx 가 버퍼링하면 실시간이 아니게 된다.
      'X-Accel-Buffering': 'no',
    },
  })
}
