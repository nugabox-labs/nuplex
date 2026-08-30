import { query, queryOne } from '@/lib/db'

// 딥시크 — 이 서비스가 쓰는 유일한 LLM.
//
// OpenAI 호환 API 라 SDK 없이 fetch 로 부른다. 의존성을 하나 더 들이지 않으려는 것이다.
//
// **화면을 그리는 길에서 부르지 않는다.** v4 는 전부 추론 모델이라 답 하나에
// 30초~2분이 걸린다(실측 109초). 부르는 곳은 sync 워커 하나뿐이고, 화면은 워커가
// 담아둔 것을 읽기만 한다 — Plex 를 워커로 몰아넣은 것과 같은 이유다(AGENTS.md §2).

const API_BASE = 'https://api.deepseek.com'

/**
 * 관리자 화면 셀렉트에 뜨는 목록. `GET https://api.deepseek.com/models` 가 주는 것과 같다.
 *
 * `deepseek-v4-flash-vision-exp` 는 뺐다 — 이미지용 실험판이라 우리 용도에 쓸 일이 없다.
 */
export const AI_MODELS = [
  {
    id: 'deepseek-v4-pro',
    label: 'V4 Pro',
    note: '추천이 더 날카롭다. 취향 분석은 호출이 드물어 이쪽을 기본으로 둔다',
  },
  {
    id: 'deepseek-v4-flash',
    label: 'V4 Flash',
    note: '더 싸고 조금 무난하다. 사용량을 줄이고 싶을 때',
  },
] as const

export const DEFAULT_MODEL = AI_MODELS[0].id

/** 키가 없거나 딥시크가 답을 못 준 경우. 화면은 이 때 AI 카드만 접는다. */
export class AiUnavailableError extends Error {}

export function hasApiKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY)
}

/** 관리자가 고른 모델. 고른 적이 없거나 목록에서 사라진 이름이면 기본값으로 돌아간다. */
export async function getModel(): Promise<string> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM ai_setting WHERE key = 'model'`,
  )
  const chosen = row?.value ?? ''
  return AI_MODELS.some((model) => model.id === chosen) ? chosen : DEFAULT_MODEL
}

export async function setModel(model: string): Promise<void> {
  if (!AI_MODELS.some((entry) => entry.id === model)) {
    throw new Error('모르는 모델입니다.')
  }
  await query(
    `INSERT INTO ai_setting (key, value) VALUES ('model', $1)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [model],
  )
}

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_cache_hit_tokens?: number
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
  usage?: Usage
}

/**
 * JSON 하나를 받아오는 호출. 우리가 LLM 에 시키는 일은 전부 이 모양이다.
 *
 * 성공하든 실패하든 ai_usage 에 한 줄 남긴다 — 관리자 화면의 월별 사용량이 이걸 센다.
 */
export async function chatJson<T>(options: {
  purpose: string
  system: string
  user: string
  /**
   * 딥시크가 답을 못 끝내면 여기서 끊는다.
   *
   * 넉넉해 보여도 그렇지 않다 — 취향 분석 한 번이 실제로 109초 걸린 적이 있다.
   * 추론 모델이라 답 길이에 따라 편차가 크다. 부르는 곳이 sync 워커뿐이라
   * 오래 기다려도 화면이 늦어지지 않는다.
   */
  timeoutMs?: number
}): Promise<T> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new AiUnavailableError('DEEPSEEK_API_KEY 가 설정되지 않았습니다.')

  const model = await getModel()
  const started = Date.now()

  let response: Response
  try {
    response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 240_000),
    })
  } catch (error) {
    // 그물 밖으로 못 나간 경우(타임아웃 · DNS). 응답이 없어 토큰 수도 없다.
    await recordUsage({ model, purpose: options.purpose, error: describe(error) })
    throw new AiUnavailableError(`딥시크에 닿지 못했습니다 (${describe(error)})`)
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 500)
    await recordUsage({
      model,
      purpose: options.purpose,
      error: `HTTP ${response.status} ${detail}`,
    })
    throw new AiUnavailableError(`딥시크가 ${response.status} 로 답했습니다.`)
  }

  const body = (await response.json().catch(() => null)) as ChatResponse | null
  const usage = body?.usage ?? {}
  const content = body?.choices?.[0]?.message?.content ?? ''

  let parsed: T
  try {
    parsed = JSON.parse(content) as T
  } catch {
    await recordUsage({ model, purpose: options.purpose, usage, error: 'JSON 이 아닌 답' })
    throw new AiUnavailableError('딥시크가 JSON 이 아닌 답을 줬습니다.')
  }

  await recordUsage({ model, purpose: options.purpose, usage })
  console.log(
    `[ai] ${options.purpose} · ${model} · ${Date.now() - started}ms · ` +
      `${usage.prompt_tokens ?? 0}+${usage.completion_tokens ?? 0} 토큰`,
  )
  return parsed
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 사용량 기록이 실패해도 본 작업을 막지 않는다 — 이건 곁다리다. */
async function recordUsage(entry: {
  model: string
  purpose: string
  usage?: Usage
  error?: string
}): Promise<void> {
  await query(
    `INSERT INTO ai_usage
       (model, purpose, prompt_tokens, completion_tokens, cached_tokens, ok, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.model,
      entry.purpose,
      entry.usage?.prompt_tokens ?? 0,
      entry.usage?.completion_tokens ?? 0,
      entry.usage?.prompt_cache_hit_tokens ?? 0,
      !entry.error,
      entry.error ?? null,
    ],
  ).catch((error) => console.error('[ai] 사용량 기록 실패', error))
}

// --- 사용량 (관리자 화면) -----------------------------------------------------

export interface MonthlyUsage {
  /** `2026-08` */
  month: string
  calls: number
  failed: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
}

/** 월별 사용량. KST 기준으로 접는다 — 전 구간이 KST 다(AGENTS.md §2). */
export async function getMonthlyUsage(months = 12): Promise<MonthlyUsage[]> {
  return (
    await query<{
      month: string
      calls: string
      failed: string
      prompt_tokens: string
      completion_tokens: string
      cached_tokens: string
    }>(
      `SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
              count(*) AS calls,
              count(*) FILTER (WHERE NOT ok) AS failed,
              coalesce(sum(prompt_tokens), 0) AS prompt_tokens,
              coalesce(sum(completion_tokens), 0) AS completion_tokens,
              coalesce(sum(cached_tokens), 0) AS cached_tokens
         FROM ai_usage
        GROUP BY month
        ORDER BY month DESC
        LIMIT $1`,
      [months],
    )
  ).map((row) => ({
    month: row.month,
    calls: Number(row.calls),
    failed: Number(row.failed),
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    cachedTokens: Number(row.cached_tokens),
  }))
}

/**
 * 딥시크 계정에 남은 돈. 토큰 수는 우리가 세지만 실제로 얼마가 나갔는지는 저쪽만 안다.
 * 단가를 우리가 적어두면 저쪽이 값을 바꿀 때 조용히 틀린 숫자가 되므로, 돈은 묻는다.
 */
export async function getBalance(): Promise<{ currency: string; total: string } | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch(`${API_BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      balance_infos?: { currency: string; total_balance: string }[]
    }
    const info = body.balance_infos?.[0]
    return info ? { currency: info.currency, total: info.total_balance } : null
  } catch {
    // 잔액은 곁다리다. 못 받아오면 화면에서 그 줄만 빠진다.
    return null
  }
}
