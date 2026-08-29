import { NextResponse, type NextRequest } from 'next/server'
import {
  AI_MODELS,
  getBalance,
  getModel,
  getMonthlyUsage,
  hasApiKey,
  setModel,
} from '@/lib/ai/deepseek'

// AI 관리 — 쓸 모델을 고르고, 이 서비스가 얼마나 썼는지 본다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [model, usage, balance] = await Promise.all([
    getModel(),
    getMonthlyUsage(),
    // 잔액은 딥시크에 물어야 안다. 못 받아오면 그 줄만 빠진다.
    getBalance(),
  ])

  return NextResponse.json({ hasKey: hasApiKey(), model, models: AI_MODELS, usage, balance })
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { model?: unknown } | null
  const model = typeof body?.model === 'string' ? body.model : ''

  try {
    await setModel(model)
  } catch {
    return NextResponse.json({ error: '모르는 모델입니다.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
