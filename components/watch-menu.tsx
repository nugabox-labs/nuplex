'use client'

import { useEffect, useState } from 'react'
import { Cast, ExternalLink, Loader2, MonitorSmartphone, Play, X } from 'lucide-react'

// "시청하기" 를 눌렀을 때 어디서 볼지 고르는 모달.
//
// 브라우저에서는 이 모달이 뜨지 않는다 — 고를 것이 하나뿐이라 곧바로 Plex 웹앱으로
// 보낸다. 앱 셸 안에서만 선택지가 생긴다(계약 v2, BRIDGE_CONTRACT.md §7).
//
// **TV 항목은 닿는 플레이어가 있을 때만 나온다.** Plex 플레이어는 사설 IP 하나만
// 광고하고 relay 주소가 없어서, 같은 WiFi 밖에서는 원리적으로 닿지 않는다. 밖에
// 있을 때 항목이 없는 것은 고장이 아니라 정상이다.

interface CastTarget {
  id: string
  name: string
  uri: string
}

interface NuplexNative {
  bridgeVersion: number
  platform: 'ios' | 'android'
  openInPlex(params: {
    webUrl: string
    machineIdentifier?: string
    ratingKey?: string
    type?: string
  }): Promise<unknown>
  listCastTargets?(params: {
    candidates: { id: string; name: string; uri: string }[]
    token: string
  }): Promise<{ targets: CastTarget[] }>
  castToTarget?(params: {
    targetId: string
    uri: string
    token: string
    serverAddress: string
    serverPort: number
    serverProtocol: 'http' | 'https'
    machineIdentifier: string
    ratingKey: string
    offset?: number
  }): Promise<{ ok: boolean; error?: string }>
  openRoutePicker?(): Promise<{ shown: boolean }>
}

function nativeBridge(): NuplexNative | null {
  if (typeof window === 'undefined') return null
  const native = (window as unknown as { NuplexNative?: NuplexNative }).NuplexNative
  return native && native.bridgeVersion >= 1 ? native : null
}

/** `<서버>/web/index.html#!/server/<서버ID>/details?key=<%2F...%2F123>` 을 뜯는다. */
function parseWebUrl(webUrl: string): { server: string; ratingKey: string } | null {
  const match = webUrl.match(/#!\/server\/([^/]+)\/details\?key=(.+)$/)
  if (!match) return null
  return {
    server: match[1],
    ratingKey: decodeURIComponent(match[2]).split('/').pop() ?? '',
  }
}

interface CastConfig {
  targets: CastTarget[]
  token: string
  server: {
    address: string
    port: number
    protocol: 'http' | 'https'
    machineIdentifier: string
  }
}

export function WatchMenu({
  href,
  type,
  className,
  children,
}: {
  href: string
  type?: string
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!nativeBridge()) return // 브라우저 — 링크를 그대로 따라간다
    event.preventDefault()
    setOpen(true)
  }

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={className}
      >
        {children}
      </a>
      {open ? <WatchSheet href={href} type={type} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function WatchSheet({
  href,
  type,
  onClose,
}: {
  href: string
  type?: string
  onClose: () => void
}) {
  const [config, setConfig] = useState<CastConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const parsed = parseWebUrl(href)

  // 후보를 받아 셸에 넘기고, 실제로 닿는 것만 돌려받는다. 이 왕복이 1~2초 걸릴 수
  // 있어서 모달을 먼저 띄우고 TV 항목만 나중에 채운다 — 기다리는 화면을 만들지 않는다.
  useEffect(() => {
    let alive = true

    async function load() {
      const native = nativeBridge()
      if (!native || native.bridgeVersion < 2 || !native.listCastTargets) {
        if (alive) setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/app/cast/targets', { cache: 'no-store' })
        if (!response.ok) throw new Error('목록을 받지 못했습니다')
        const data = await response.json()
        if (!data.token || !data.server || !data.candidates?.length) {
          if (alive) setLoading(false)
          return
        }

        const { targets } = await native.listCastTargets({
          candidates: data.candidates,
          token: data.token,
        })
        if (!alive) return
        setConfig({ targets: targets ?? [], token: data.token, server: data.server })
      } catch {
        // 조용히 물러난다. TV 항목이 안 보일 뿐 나머지 선택지는 멀쩡하다.
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  // 뒤로가기·ESC 로 닫힌다. 앱에서는 하드웨어 뒤로가기가 이 모달을 먼저 닫아야 한다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function openInPlexApp() {
    const native = nativeBridge()
    if (!native) return
    setBusy('app')
    try {
      await native.openInPlex({
        webUrl: href,
        machineIdentifier: parsed?.server,
        ratingKey: parsed?.ratingKey,
        type,
      })
      onClose()
    } catch {
      window.open(href, '_blank', 'noopener')
    } finally {
      setBusy(null)
    }
  }

  async function castTo(target: CastTarget) {
    const native = nativeBridge()
    if (!native?.castToTarget || !config || !parsed?.ratingKey) return

    setBusy(target.id)
    setMessage(null)
    const result = await native.castToTarget({
      targetId: target.id,
      uri: target.uri,
      token: config.token,
      serverAddress: config.server.address,
      serverPort: config.server.port,
      serverProtocol: config.server.protocol,
      machineIdentifier: config.server.machineIdentifier,
      ratingKey: parsed.ratingKey,
    })
    setBusy(null)

    if (result.ok) {
      onClose()
      return
    }

    // rejected 는 십중팔구 TV 에서 Plex 앱이 꺼져 있는 것이다. Companion 서버가 그 앱
    // 안에 있어 앱이 떠 있어야만 명령을 받는다 — 우리가 깨울 방법이 없다.
    setMessage(
      result.error === 'unreachable'
        ? 'TV에 닿지 못했습니다. 같은 WiFi에 있는지 확인해 주세요.'
        : 'TV에서 Plex 앱을 먼저 켠 뒤 다시 시도해 주세요.',
    )
  }

  async function openPicker() {
    const native = nativeBridge()
    if (!native?.openRoutePicker) return
    const { shown } = await native.openRoutePicker()
    if (!shown) setMessage('이 기기에서는 화면 공유를 열 수 없습니다.')
  }

  const native = nativeBridge()
  const canPick = Boolean(native && native.bridgeVersion >= 2 && native.openRoutePicker)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="어디서 볼지 고르기"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">어디서 볼까요?</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 text-foreground/60 transition hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <Row
            icon={<Play className="h-5 w-5" />}
            label="Plex 앱으로 시청"
            hint="이 기기의 Plex 앱에서 재생합니다"
            busy={busy === 'app'}
            onClick={openInPlexApp}
          />

          {config?.targets.map((target) => (
            <Row
              key={target.id}
              icon={<Cast className="h-5 w-5" />}
              label={`${target.name}에서 시청`}
              hint="같은 WiFi의 TV로 보냅니다"
              busy={busy === target.id}
              onClick={() => castTo(target)}
            />
          ))}

          {loading ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              주변 TV를 찾는 중…
            </p>
          ) : null}

          {canPick ? (
            <Row
              icon={<MonitorSmartphone className="h-5 w-5" />}
              label="화면 공유"
              hint={
                native?.platform === 'ios'
                  ? 'AirPlay로 보냅니다'
                  : '시스템 화면 미러링을 엽니다'
              }
              onClick={openPicker}
            />
          ) : null}

          <Row
            icon={<ExternalLink className="h-5 w-5" />}
            label="브라우저에서 열기"
            hint="Plex 웹에서 재생합니다"
            onClick={() => {
              window.open(href, '_blank', 'noopener')
              onClose()
            }}
          />
        </div>

        {message ? (
          <p className="mt-4 rounded-lg bg-foreground/5 px-3 py-2 text-xs leading-relaxed text-foreground/70">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  hint,
  busy,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-foreground/5 disabled:opacity-60"
    >
      <span className="text-primary">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-foreground/55">{hint}</span>
      </span>
    </button>
  )
}
