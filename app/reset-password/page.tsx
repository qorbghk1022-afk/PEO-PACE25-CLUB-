'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  useEffect(() => { router.push('/login') }, [router])
  return <div style={{ padding: 40, textAlign: 'center' }}>로그인 페이지로 이동 중...</div>
}
