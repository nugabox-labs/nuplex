'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AI_MODELS, MonthlyUsage } from '@/lib/ai/deepseek'

// AI 관리 — 쓸 모델을 고르고 월별 사용량을 본다.
//
// 사용량은 우리가 남긴 호출 기록(ai_usage)을 접은 것이라 토큰 수까지만 정확하다.
// **얼마가 나갔는지는 딥시크만 안다** — 단가를 여기 적어두면 저쪽이 값을 바꿀 때
// 조용히 틀린 숫자가 되므로, 돈은 계산하지 않고 남은 잔액을 물어서 보여준다.

interface Payload {
  hasKey: boolean
  model: string
  models: typeof AI_MODELS
  usage: MonthlyUsage[]
  balance: { currency: string; total: string } | null
}

export function AiAdmin() {
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/ai')
    if (!res.ok) return
    setData((await res.json()) as Payload)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function choose(model: string) {
    setBusy(true)
    setData((current) => (current ? { ...current, model } : current))
    await fetch('/api/admin/ai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    // 실패했으면 이 load 가 되돌린다.
    await load()
    setBusy(false)
  }

  if (!data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>

  const chosen = data.models.find((model) => model.id === data.model)

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-bold text-foreground">쓸 모델</h2>

        {data.hasKey ? null : (
          <p className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            <code>DEEPSEEK_API_KEY</code> 가 비어 있습니다. 키를 넣기 전까지 &quot;내 취향&quot; 의
            AI 카드는 나오지 않습니다(시청 목록 · 통계는 그대로 나옵니다).
          </p>
        )}

        <select
          value={data.model}
          disabled={busy}
          onChange={(event) => void choose(event.target.value)}
          className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 md:w-80"
        >
          {data.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label} — {model.id}
            </option>
          ))}
        </select>

        {chosen ? <p className="mt-2 text-sm text-muted-foreground">{chosen.note}</p> : null}

        <p className="mt-3 text-xs text-muted-foreground">
          모델을 바꾸면 각 프로필의 취향 요약은 다음에 &quot;내 취향&quot; 을 열 때 새 모델로 다시
          만들어집니다. 한 번 만드는 데 30초에서 1분쯤 걸립니다.
        </p>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-bold text-foreground">사용량</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          이 서비스가 딥시크를 부른 기록입니다. 토큰 수는 딥시크가 응답에 실어 준 값 그대로입니다.
          {data.balance ? (
            <>
              {' '}
              남은 잔액{' '}
              <strong className="text-foreground">
                {data.balance.total} {data.balance.currency}
              </strong>
            </>
          ) : null}
        </p>

        {data.usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 부른 적이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">월</th>
                  <th className="py-2 pr-3 text-right font-medium">호출</th>
                  <th className="py-2 pr-3 text-right font-medium">입력 토큰</th>
                  <th className="py-2 pr-3 text-right font-medium">출력 토큰</th>
                  <th className="py-2 pr-3 text-right font-medium">캐시 적중</th>
                  <th className="py-2 text-right font-medium">실패</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.usage.map((row) => (
                  <tr key={row.month}>
                    <td className="py-2 pr-3 text-foreground">{row.month}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {row.calls.toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {row.promptTokens.toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {row.completionTokens.toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {row.cachedTokens.toLocaleString('ko-KR')}
                    </td>
                    <td
                      className={
                        row.failed > 0
                          ? 'py-2 text-right tabular-nums text-primary'
                          : 'py-2 text-right tabular-nums text-muted-foreground'
                      }
                    >
                      {row.failed.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          출력 토큰에는 모델이 속으로 생각하는 데 쓴 추론 토큰이 함께 들어 있습니다 — v4 는 전부
          추론 모델이라 답 하나에 1,000~2,000개를 씁니다. 캐시 적중분은 입력 토큰 안에 이미 포함된
          수이며, 그만큼 값이 싸게 매겨집니다.
        </p>
      </section>
    </div>
  )
}
