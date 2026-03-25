import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PEO — PACE25 CLUB',
  description: '달리면 성장하는 러너 캐릭터 앱',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
