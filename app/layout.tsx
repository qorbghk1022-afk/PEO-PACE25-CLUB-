import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PEO — PACE25 CLUB',
  description: '달리면 성장하는 러너 캐릭터 앱',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PEO',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#A51C30" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="PEO" />
        <link rel="apple-touch-icon" href="/peo-egglog-black.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
