'use client'

import { useEffect } from 'react'

// 앱 셸에게 "웹이 라우팅 준비를 마쳤다" 고 알린다.
//
// 이게 없으면 앱이 완전히 종료된 상태에서 알림을 탭했을 때 해당 작품으로 가지 않는다.
// 셸은 알림 라우트를 웹뷰보다 먼저 받기 때문에, 그 값을 들고 있다가 이 신호를 받고서야
// 이동시킨다. 신호를 안 보내면 라우트가 대기열에 영원히 남는다.
//
// 브라우저에는 NuplexNative 가 없다. 계약대로 optional 로 다룬다.
// 계약: docs/BRIDGE_CONTRACT.md §4

export function NativeBridgeReady() {
  useEffect(() => {
    const native = (window as unknown as { NuplexNative?: { notifyWebReady?: () => void } })
      .NuplexNative
    native?.notifyWebReady?.()
  }, [])

  return null
}
