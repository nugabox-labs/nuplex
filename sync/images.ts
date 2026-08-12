import { createHash } from 'node:crypto'
import { mkdir, rename, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fetchWithRetry, imageUrl, type PlexEnv } from '@/lib/plex/client'

// 포스터 · 배경을 미리 받아 로컬 파일로 둔다. 화면이 Plex 를 실시간으로 찌르지 않게
// 하는 것이 이 앱의 존재 이유다 — 토큰도 새지 않고, 그리드 한 화면에 수십 건이
// NAS 로 몰리는 일도 없다.

export type ImageKind = 'posters' | 'backdrops' | 'seasons' | 'episodes' | 'people' | 'avatars'

// 종류별 저장 크기. 화면에서 쓰는 최대 크기에 맞춘다.
const SIZES: Record<ImageKind, { width: number; height: number }> = {
  posters: { width: 400, height: 600 },
  backdrops: { width: 1920, height: 1080 },
  seasons: { width: 300, height: 450 },
  episodes: { width: 480, height: 270 },
  people: { width: 160, height: 160 },
  avatars: { width: 200, height: 200 },
}

function mediaDir(): string {
  return process.env.MEDIA_DIR || path.join(process.cwd(), 'data/media')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Plex 이미지 경로 하나를 받아 로컬에 저장하고, DB 에 넣을 상대 경로를 돌려준다.
 *
 * 파일명에 Plex 경로의 해시를 박는다. Plex 경로에는 갱신 시각이 들어 있어서
 * 아트가 바뀌면 경로도 바뀐다 → 파일명이 바뀌고, 안 바뀌었으면 그대로다.
 * 덕분에 이미 받은 파일은 건너뛸 수 있고(재개 가능), 브라우저 캐시도 영구로 걸 수 있다.
 *
 * 실패해도 예외를 던지지 않는다. 이미지 한 장 때문에 동기화 전체가 멈추면 안 된다.
 */
export async function saveImage(
  env: PlexEnv,
  kind: ImageKind,
  plexPath: string | undefined | null,
): Promise<{ file: string | null; downloaded: boolean }> {
  if (!plexPath) return { file: null, downloaded: false }

  const hash = createHash('sha1').update(plexPath).digest('hex').slice(0, 12)
  const relative = `${kind}/${hash}.jpg`
  const absolute = path.join(mediaDir(), relative)

  if (await exists(absolute)) return { file: relative, downloaded: false }

  const { width, height } = SIZES[kind]
  // 아바타는 plex.tv 의 절대 URL 이라 우리 서버의 사진 트랜스코더를 못 태운다. 원본을 받는다.
  const source = plexPath.startsWith('http')
    ? plexPath
    : imageUrl(env, plexPath, width, height)

  try {
    const res = await fetchWithRetry('이미지 내려받기', source, {
      headers: { 'X-Plex-Token': env.token },
      signal: AbortSignal.timeout(60_000),
    })

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0) return { file: null, downloaded: false }

    await mkdir(path.dirname(absolute), { recursive: true })
    // 임시 파일에 쓰고 옮긴다. 중간에 죽어도 반쪽짜리 파일이 남지 않는다.
    const temp = `${absolute}.${process.pid}.tmp`
    await writeFile(temp, buffer)
    await rename(temp, absolute)
    return { file: relative, downloaded: true }
  } catch {
    return { file: null, downloaded: false }
  }
}

/**
 * 동시에 n 개까지만 실행하는 최소한의 큐.
 *
 * 출연진 썸네일을 한 항목당 20장까지 직렬로 받으면 항목 하나에 2초가 넘게 걸린다
 * (실측: 분당 23건 → 1,900편이면 몇 시간). 그렇다고 20장을 한꺼번에 던지면 NAS 를
 * 덮는다. 그 사이를 잡는 용도다.
 */
export function createLimiter(concurrency: number) {
  let active = 0
  const waiting: (() => void)[] = []

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}
