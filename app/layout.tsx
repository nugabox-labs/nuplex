import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

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
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '1024x1024' },
      { url: '/icon.svg', type: 'image/svg+xml' },
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
    images: [{ url: '/og.png', width: 1200, height: 675, alt: 'NUPLEX' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NUPLEX — 나만의 OTT',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0f0f0f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="bg-background">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
