'use client'

// Plex 로 넘기는 링크.
//
// 앱 셸 안에서는 `NuplexNative.openInPlex` 에 넘긴다 — 스킴 판단과 폴백은 셸의 몫이라고
// 계약에 적혀 있다(docs/BRIDGE_CONTRACT.md §1). 브라우저에서는 그냥 링크를 따라간다.
//
// 폰 브라우저에서 Plex 앱 스킴(plex://…)을 쓰는 길은 접었다. preplay · play ·
// plexappext, 인코딩 유무, metadataType 유무까지 열두 가지를 폰에서 직접 눌러 봤지만
// 앱은 홈 화면만 열었다. Plex 가 2024년 앱 개편 이후 딥링크를 막은 것으로 보이고
// 우리 쪽에서 붙들 수단이 없다. 대신 링크를 서버 웹앱 주소로 바꿔(lib/library.ts)
// 어디서 눌러도 그 작품이 열린다. 앱 안에서의 처리는 나중에 셸이 맡는다.

interface NuplexNative {
  bridgeVersion: number
  openInPlex(params: {
    webUrl: string
    machineIdentifier?: string
    ratingKey?: string
  }): Promise<unknown>
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

export function PlexLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const native = (window as unknown as { NuplexNative?: NuplexNative }).NuplexNative
    // 존재와 버전을 모두 확인한다 — 구버전 셸에서 없는 메서드를 부르면 화면이 죽는다.
    if (!native || native.bridgeVersion < 1 || typeof native.openInPlex !== 'function') return

    event.preventDefault()
    const parsed = parseWebUrl(href)
    native
      .openInPlex({
        webUrl: href,
        machineIdentifier: parsed?.server,
        ratingKey: parsed?.ratingKey,
      })
      .catch(() => window.open(href, '_blank', 'noopener'))
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {children}
    </a>
  )
}
