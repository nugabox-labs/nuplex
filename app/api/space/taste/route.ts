import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { PROFILE_COOKIE, readProfileValue } from '@/lib/auth/session'
import { AiUnavailableError, hasApiKey } from '@/lib/ai/deepseek'
import { NotEnoughHistoryError, generateTaste, getCachedTaste } from '@/lib/ai/taste'

// 취향 카드를 채우는 자리. 화면이 뜬 뒤에 클라이언트가 부른다 —
// 딥시크 응답이 30초~1분이라 서버 렌더링에 끼워 넣을 수 없다(lib/ai/taste.ts).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 만드는 데 1분 가까이 걸린다. 기본값(대개 15초)으로 두면 다 만들고도 응답이 끊긴다.
export const maxDuration = 180

export async function POST(request: NextRequest) {
  const profileId = await readProfileValue((await cookies()).get(PROFILE_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ state: 'unavailable', message: '프로필이 없습니다.' })
  }
  if (!hasApiKey()) {
    return NextResponse.json({ state: 'no-key' })
  }

  const body = (await request.json().catch(() => null)) as { refresh?: boolean } | null

  try {
    // 담아둔 것이 아직 쓸 만하면 그대로 준다. "다시 분석" 을 누른 때만 건너뛴다.
    const cached = body?.refresh === true ? null : await getCachedTaste(profileId)
    const taste = cached ?? (await generateTaste(profileId))
    return NextResponse.json({ state: 'ok', taste })
  } catch (error) {
    if (error instanceof NotEnoughHistoryError) {
      return NextResponse.json({ state: 'not-enough' })
    }
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ state: 'unavailable', message: error.message })
    }
    console.error('[space] 취향 분석 실패', error)
    return NextResponse.json({ state: 'unavailable', message: '분석에 실패했습니다.' })
  }
}
