import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { NativeBridgeReady } from '@/components/native-bridge-ready'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

const DESCRIPTION = '나만의 OTT, NUPLEX'

// OG 이미지는 절대 주소로 나가야 카카오톡 · 메신저가 읽는다. 지정하지 않으면 Next.js 가
// localhost:3000 으로 채워버려서 미리보기에 이미지가 안 뜬다.
const SITE_URL = process.env.SITE_URL || 'http://localhost:2620'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NUPLEX — 나만의 OTT',
    template: '%s · NUPLEX',
  },
  description: DESCRIPTION,
  applicationName: 'NUPLEX',
  // SVG 아이콘을 같이 선언하면 브라우저가 그쪽을 우선한다. v0 목업이 남긴
  // icon.svg 가 그래서 파비콘 자리에 계속 나왔다 — PNG 하나만 둔다.
  icons: {
    // 탭 파비콘은 64px 짜리로 충분하다. 1024 원본을 매번 받게 하면 236KB 를 버린다.
    icon: [
      { url: '/icon-64.png', type: 'image/png', sizes: '64x64' },
      { url: '/icon.png', type: 'image/png', sizes: '1024x1024' },
    ],
    apple: '/icon.png',
  },
  // 카카오톡 · 메신저에 링크를 붙였을 때 뜨는 미리보기.
  openGraph: {
    type: 'website',
    siteName: 'NUPLEX',
    title: 'NUPLEX — 나만의 OTT',
    description: DESCRIPTION,
    locale: 'ko_KR',
    images: [{ url: '/nuplex_social-preview.jpg', width: 1280, height: 640, alt: 'NUPLEX' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NUPLEX — 나만의 OTT',
    description: DESCRIPTION,
    images: ['/nuplex_social-preview.jpg'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0f0f0f',
  // 앱 셸의 웹뷰가 노치 · 다이나믹 아일랜드 · 홈 인디케이터 영역까지 쓰게 한다.
  // 이걸 켰으면 화면 가장자리에 붙는 UI 는 env(safe-area-inset-*) 로 여백을 줘야
  // 잘리지 않는다 (docs/APP-INTEGRATION.md §2).
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="bg-background">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        {/* 앱 셸에 라우팅 준비 완료를 알린다. 브라우저에서는 아무 일도 하지 않는다. */}
        <NativeBridgeReady />
      </body>
    </html>
  )
}
