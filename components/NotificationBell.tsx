'use client'

import { useState, useEffect } from 'react'
import type { Notification } from '@/lib/types'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

export default function NotificationBell({ userId }: { userId: string | null }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => {
    if (userId) loadNotifications()
  }, [userId])

  async function loadNotifications() {
    const res = await fetchWithAuth('/api/notifications')
    const { notifications: data } = await res.json()
    setNotifications(data || [])
  }

  async function markAllRead() {
    if (!userId) return
    await fetchWithAuth('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function handleRequest(requestId: string, action: 'approve' | 'reject') {
    if (!userId) return
    setLoading(true)
    await fetchWithAuth('/api/crew/handle-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action })
    })
    await loadNotifications()
    setLoading(false)
  }

  function toggle() {
    setOpen(!open)
    if (!open && unreadCount > 0) markAllRead()
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}분 전`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}시간 전`
    return `${Math.floor(hrs / 24)}일 전`
  }

  return (
    <div className="notif-wrap">
      <button className="notif-bell" onClick={toggle}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="notif-overlay" onClick={() => setOpen(false)} />
          <div className="notif-dropdown">
            <div className="notif-header">
              <span>알림</span>
              {notifications.length > 0 && (
                <button className="notif-clear" onClick={markAllRead}>모두 읽음</button>
              )}
            </div>
            {notifications.length === 0 && (
              <div className="notif-empty">알림이 없습니다</div>
            )}
            {notifications.map(n => (
              <div key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`}>
                <div className="notif-title">{n.title}</div>
                <div className="notif-time">{timeAgo(n.created_at)}</div>
                {n.type === 'join_request' && (n.metadata as Record<string, string>)?.requester_user_id && (
                  <div className="notif-actions">
                    <button
                      className="notif-approve"
                      onClick={() => {
                        const meta = n.metadata as Record<string, string>
                        // Find the join request by crew_id and requester
                        handleRequest(meta.request_id || n.id, 'approve')
                      }}
                      disabled={loading}
                    >수락</button>
                    <button
                      className="notif-reject"
                      onClick={() => {
                        const meta = n.metadata as Record<string, string>
                        handleRequest(meta.request_id || n.id, 'reject')
                      }}
                      disabled={loading}
                    >거절</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
