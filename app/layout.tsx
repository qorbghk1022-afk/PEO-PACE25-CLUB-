import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.pace25.com'),
  title: 'PACE25',
  description: '달리면서 성장하는 러닝 캐릭터 챌린지',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PEO',
  },
  openGraph: {
    title: 'PACE25',
    description: '달리면서 성장하는 러닝 캐릭터 챌린지',
    url: 'https://www.pace25.com',
    siteName: 'PEO PACE25 CLUB',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: '/peo-real-new-black.png', alt: 'PEO PACE25 CLUB' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PACE25',
    description: '달리면서 성장하는 러닝 캐릭터 챌린지',
    images: ['/peo-real-new-black.png'],
  },
  icons: {
    icon: '/peo-egglog-black.png',
    apple: '/peo-egglog-black.png',
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
