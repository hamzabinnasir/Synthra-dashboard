'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { NOTIFICATIONS_CHANGED, emitNotificationsChanged } from './useUnreadCounts'
import './notifications.css'

/* ------------------------------------------------------------------ sound */

// One shared AudioContext. Browsers keep a context "suspended" until the page has had a
// user gesture, which is why a context created inside a notification callback stays silent.
let audioContext = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioContext) audioContext = new Ctx()
  return audioContext
}

async function unlockAudio() {
  const ctx = getAudioContext()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    try { await ctx.resume() } catch {}
  }
  return ctx.state === 'running'
}

// A soft bell: a pure tone plus a quickly fading inharmonic overtone.
function strikeBell(ctx, frequency, start, { gain = 0.2, decay = 1.1, type = 'sine' } = {}) {
  const tone = ctx.createOscillator()
  const overtone = ctx.createOscillator()
  const toneGain = ctx.createGain()
  const overtoneGain = ctx.createGain()

  tone.type = type
  tone.frequency.setValueAtTime(frequency, start)
  overtone.type = 'sine'
  overtone.frequency.setValueAtTime(frequency * 2.76, start)

  toneGain.gain.setValueAtTime(0.0001, start)
  toneGain.gain.exponentialRampToValueAtTime(gain, start + 0.008)
  toneGain.gain.exponentialRampToValueAtTime(0.0001, start + decay)
  overtoneGain.gain.setValueAtTime(gain * 0.35, start)
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + decay * 0.4)

  tone.connect(toneGain)
  overtone.connect(overtoneGain)
  overtoneGain.connect(toneGain)
  toneGain.connect(ctx.destination)

  tone.start(start)
  overtone.start(start)
  tone.stop(start + decay + 0.05)
  overtone.stop(start + decay + 0.05)
}

/** Plays the notification "ting". Returns false when the browser is still blocking audio. */
async function playTing(urgent = false) {
  const ctx = getAudioContext()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    try { await ctx.resume() } catch { return false }
  }
  if (ctx.state !== 'running') return false

  const now = ctx.currentTime + 0.02
  if (urgent) {
    // Rising three-note chime so a human-request stands out from a normal message.
    strikeBell(ctx, 880, now, { gain: 0.2, decay: 0.9, type: 'triangle' })
    strikeBell(ctx, 1174.66, now + 0.14, { gain: 0.2, decay: 0.9, type: 'triangle' })
    strikeBell(ctx, 1567.98, now + 0.28, { gain: 0.22, decay: 1.3, type: 'triangle' })
  } else {
    strikeBell(ctx, 1318.51, now, { gain: 0.2, decay: 1.2 })
    strikeBell(ctx, 1975.53, now + 0.11, { gain: 0.13, decay: 1.0 })
  }
  return true
}

/* ---------------------------------------------------------------- helpers */

function formatTimeAgo(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function groupLabel(dateStr) {
  const date = new Date(dateStr)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const yesterday = new Date(start)
  yesterday.setDate(start.getDate() - 1)
  if (date >= start) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  return 'Earlier'
}

function hrefFor(item) {
  if (item.source_type === 'comment') {
    const path = item.platform === 'instagram' ? '/instagram/comments' : '/facebook/comments'
    return `${path}#comment-${encodeURIComponent(item.target_id)}`
  }
  if (item.platform === 'whatsapp') return `/conversation/${encodeURIComponent(item.target_id)}`
  if (item.platform === 'instagram') return `/instagram/inbox/${encodeURIComponent(item.target_id)}`
  return `/facebook/inbox/${encodeURIComponent(item.target_id)}`
}

const PLATFORM_STYLE = {
  whatsapp: { label: 'WhatsApp', dot: 'W', main: '#25d366', c1: '#25d366', c2: '#0f8f6b' },
  facebook: { label: 'Facebook', dot: 'f', main: '#1877f2', c1: '#3b8cff', c2: '#0b4fb3' },
  instagram: { label: 'Instagram', dot: 'IG', main: '#e1306c', c1: '#f58529', c2: '#c13584' },
}

function platformStyle(platform) {
  return PLATFORM_STYLE[platform] || { label: platform || 'Inbox', dot: '•', main: '#24d9e6', c1: '#24d9e6', c2: '#1b8fb3' }
}

function platformVars(platform) {
  const meta = platformStyle(platform)
  return { '--ntf-platform': meta.main, '--ntf-c1': meta.c1, '--ntf-c2': meta.c2 }
}

function kindOf(item) {
  if (item.type === 'human_request') return { key: 'urgent', label: 'Human requested', icon: '🚨' }
  if (item.type === 'media') return { key: 'media', label: 'Media', icon: '📎' }
  if (item.source_type === 'comment') return { key: 'comment', label: 'Comment', icon: '💬' }
  return { key: 'message', label: 'Message', icon: '✉️' }
}

function displayName(item) {
  return item.customer_name || item.customer_username || item.customer_id || 'New contact'
}

function initialsOf(name) {
  const parts = String(name || '?').replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]
  return letters.toUpperCase()
}

function NotificationAvatar({ item }) {
  const meta = platformStyle(item.platform)
  return (
    <span className="ntf-avatar" style={platformVars(item.platform)} aria-hidden="true">
      {initialsOf(displayName(item))}
      <span className="ntf-avatar__dot">{meta.dot}</span>
    </span>
  )
}

const DEFAULT_SETTINGS = {
  sound_enabled: true,
  desktop_enabled: false,
  dnd_enabled: false,
  popup_enabled: true,
  popup_seconds: 7,
  muted_platforms: { whatsapp: false, facebook: false, instagram: false },
  muted_types: { inbox: false, comment: false, media: false, human_request: false },
}

const PLATFORM_FILTERS = [
  ['all', 'All'],
  ['whatsapp', 'WhatsApp'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
]

const TYPE_FILTERS = [
  ['all', 'All types'],
  ['human_request', 'Human'],
  ['inbox', 'Messages'],
  ['comment', 'Comments'],
  ['media', 'Media'],
]

const TOAST_MS = 6500
const URGENT_TOAST_MS = 11000

/* -------------------------------------------------------------- component */

export default function NotificationCenter() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState([])
  const [ringing, setRinging] = useState(false)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState('')
  const dropdownRef = useRef(null)
  const seenIds = useRef(new Set())
  const ringTimer = useRef(null)

  const persistSettings = async (next) => {
    setSettings(next)
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = await res.json()
      setSettingsNotice(
        data?.migration_needed
          ? 'Pop-up settings will not be remembered after reload until migration 20261012_notification_popup_settings.sql is run.'
          : ''
      )
    } catch {}
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const query = new URLSearchParams({ limit: '50' })
      if (platformFilter !== 'all') query.set('platform', platformFilter)
      if (typeFilter !== 'all') query.set('type', typeFilter)
      if (unreadOnly) query.set('unread_only', 'true')
      const res = await fetch(`/api/notifications?${query}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.success) {
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count || 0)
        for (const item of data.notifications || []) seenIds.current.add(item.id)
      }
    } catch {}
  }, [platformFilter, typeFilter, unreadOnly])

  useEffect(() => {
    void fetch('/api/notifications/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchNotifications() }, 0)
    return () => clearTimeout(timer)
  }, [fetchNotifications])

  // Unlock sound on the first click / key press / touch anywhere on the page.
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'touchstart']
    const unlock = () => {
      void unlockAudio().then((ok) => {
        if (ok) setSoundBlocked(false)
      })
      events.forEach((name) => window.removeEventListener(name, unlock))
    }
    events.forEach((name) => window.addEventListener(name, unlock, { passive: true }))
    return () => events.forEach((name) => window.removeEventListener(name, unlock))
  }, [])

  // Other parts of the app (header tabs) changed notifications: re-sync the list.
  useEffect(() => {
    const onChanged = (event) => {
      if (event.detail?.origin === 'center') return
      void fetchNotifications()
    }
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged)
  }, [fetchNotifications])

  // Show the unread count in the browser tab title, e.g. "(3) Synthra".
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base
    return () => {
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, '')
    }
  }, [unreadCount])

  useEffect(() => () => clearTimeout(ringTimer.current), [])

  const ringBell = () => {
    clearTimeout(ringTimer.current)
    setRinging(false)
    requestAnimationFrame(() => {
      setRinging(true)
      ringTimer.current = setTimeout(() => setRinging(false), 900)
    })
  }

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  const onIncoming = useCallback((item) => {
    if (!item?.id || seenIds.current.has(item.id)) return
    seenIds.current.add(item.id)
    setNotifications((prev) => [item, ...prev.filter((n) => n.id !== item.id)])
    if (!item.is_read) setUnreadCount((c) => c + 1)
    emitNotificationsChanged('center')

    const mutedPlat = settings.muted_platforms?.[item.platform]
    const mutedType = settings.muted_types?.[item.type]
    if (settings.dnd_enabled || mutedPlat || mutedType) return

    const urgent = item.type === 'human_request'
    if (settings.popup_enabled !== false) {
      const baseMs = Math.max(3, Number(settings.popup_seconds) || 7) * 1000
      const toastId = `${item.id}-${Date.now()}`
      setToasts((prev) => [{ ...item, toastId, urgent, durationMs: urgent ? baseMs + 4000 : baseMs }, ...prev].slice(0, 4))
    }
    ringBell()

    if (settings.sound_enabled) {
      void playTing(urgent).then((played) => setSoundBlocked(!played))
    }
    if (settings.desktop_enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const title = urgent
        ? `Human requested: ${displayName(item)}`
        : `New ${platformStyle(item.platform).label} ${item.source_type}`
      new Notification(title, { body: item.message_preview || 'Open conversation', icon: '/synthra-mark.svg' })
    }
  }, [settings])

  useEffect(() => {
    let source
    let reconnect
    let closed = false

    const connect = () => {
      if (closed) return
      source = new EventSource('/api/notifications/events')
      source.addEventListener('new-notification', (event) => {
        try { onIncoming(JSON.parse(event.data)) } catch {}
      })
      source.addEventListener('notification-updated', (event) => {
        try {
          const updated = JSON.parse(event.data)
          setNotifications((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)))
        } catch {}
      })
      source.addEventListener('notification-deleted', (event) => {
        try {
          const deleted = JSON.parse(event.data)
          setNotifications((prev) => prev.filter((n) => n.id !== deleted.id))
        } catch {}
      })
      source.onerror = () => {
        source.close()
        reconnect = setTimeout(connect, 4000)
      }
    }
    connect()
    const poll = setInterval(() => { void fetchNotifications() }, 12000)

    return () => {
      closed = true
      clearTimeout(reconnect)
      clearInterval(poll)
      source?.close()
    }
  }, [onIncoming, fetchNotifications])

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
        setShowSettings(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const markAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_read: true }),
      })
    } catch {}
    emitNotificationsChanged('center')
  }

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformFilter }),
      })
    } catch {}
    emitNotificationsChanged('center')
  }

  const deleteOne = async (id, event) => {
    event.stopPropagation()
    const removed = notifications.find((n) => n.id === id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {}
    emitNotificationsChanged('center')
  }

  const clearAll = async () => {
    setNotifications([])
    setUnreadCount(0)
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_all: true }),
      })
    } catch {}
    emitNotificationsChanged('center')
  }

  const handleNotificationClick = (item) => {
    if (item.isPreview) return
    void markAsRead(item.id)
    setOpen(false)
    router.push(hrefFor(item))
  }

  const testSound = async () => {
    const played = await playTing(false)
    setSoundBlocked(!played)
  }

  // Shows a sample pop-up so the duration / on-off choice can be checked without waiting for a message.
  const previewPopup = () => {
    const id = `preview-${Date.now()}`
    const durationMs = Math.max(3, Number(settings.popup_seconds) || 7) * 1000
    setToasts((prev) => [{
      id,
      toastId: id,
      isPreview: true,
      urgent: false,
      durationMs,
      platform: 'whatsapp',
      source_type: 'inbox',
      type: 'inbox',
      customer_name: 'Preview',
      message_preview: 'This is how a new-message pop-up will look.',
    }, ...prev].slice(0, 4))
  }

  const grouped = notifications.reduce((acc, item) => {
    const key = groupLabel(item.created_at)
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* ---------- Pop-up toasts ---------- */}
      <div className="ntf-toasts" role="status" aria-live="polite">
        {toasts.map((item) => {
          const meta = platformStyle(item.platform)
          const kind = kindOf(item)
          return (
            <div
              key={item.toastId}
              role="button"
              tabIndex={0}
              className={`ntf-toast ${item.urgent ? 'ntf-toast--urgent' : ''}`}
              style={{ ...platformVars(item.platform), '--ntf-duration': `${item.durationMs || (item.urgent ? URGENT_TOAST_MS : TOAST_MS)}ms` }}
              onClick={() => {
                dismissToast(item.toastId)
                handleNotificationClick(item)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  dismissToast(item.toastId)
                  handleNotificationClick(item)
                }
              }}
            >
              <NotificationAvatar item={item} />
              <div className="ntf-toast__body">
                <div className="ntf-toast__meta">
                  <span>{kind.icon}</span>
                  <span>{meta.label} · {kind.label}</span>
                </div>
                <p className="ntf-toast__title">{displayName(item)}</p>
                <p className="ntf-toast__text">{item.message_preview || 'New activity'}</p>
              </div>
              <button
                type="button"
                className="ntf-toast__close"
                aria-label="Dismiss notification"
                onClick={(event) => {
                  event.stopPropagation()
                  dismissToast(item.toastId)
                }}
              >
                ✕
              </button>
              <span className="ntf-toast__progress" onAnimationEnd={() => dismissToast(item.toastId)} />
            </div>
          )
        })}
      </div>

      {/* ---------- Bell ---------- */}
      <button
        type="button"
        onClick={() => {
          void unlockAudio()
          setOpen((prev) => !prev)
        }}
        className={`ntf-bell ${ringing ? 'ntf-bell--ring' : ''}`}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="ntf-badge ntf-badge--corner" key={unreadCount}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ---------- Panel ---------- */}
      {open && (
        <div className="ntf-panel">
          <div className="ntf-panel__head">
            <div className="flex items-center gap-2">
              <h3 className="theme-text text-sm font-bold">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllAsRead} className="ntf-icon-btn ntf-icon-btn--accent">
                  ✓ Mark all read
                </button>
              )}
              <button type="button" onClick={clearAll} className="ntf-icon-btn">Clear</button>
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="ntf-icon-btn"
                aria-label="Notification settings"
                aria-expanded={showSettings}
              >
                ⚙️
              </button>
            </div>
          </div>

          {soundBlocked && settings.sound_enabled && (
            <p className="ntf-notice">
              Your browser is blocking notification sound. Click anywhere on the page once to turn it on.
            </p>
          )}

          {showSettings && (
            <div className="space-y-2.5 border-b border-(--line) p-4 text-xs">
              {[
                ['popup_enabled', 'Pop-up alerts'],
                ['sound_enabled', 'Sound alerts'],
                ['desktop_enabled', 'Browser desktop notifications'],
                ['dnd_enabled', 'Do not disturb'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="theme-text font-semibold">{label}</span>
                  <div className="flex items-center gap-2">
                    {key === 'popup_enabled' && settings.popup_enabled !== false && (
                      <button type="button" onClick={previewPopup} className="ntf-icon-btn ntf-icon-btn--accent">
                        👁 Preview
                      </button>
                    )}
                    {key === 'sound_enabled' && settings.sound_enabled && (
                      <button type="button" onClick={testSound} className="ntf-icon-btn ntf-icon-btn--accent">
                        🔔 Test
                      </button>
                    )}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(settings[key])}
                      className={`bot-switch ${settings[key] ? 'is-on' : 'is-off'}`}
                      onClick={async () => {
                        let next = { ...settings, [key]: !settings[key] }
                        if (key === 'desktop_enabled' && next.desktop_enabled && typeof Notification !== 'undefined') {
                          const permission = await Notification.requestPermission()
                          next = { ...next, desktop_enabled: permission === 'granted' }
                        }
                        void persistSettings(next)
                      }}
                    >
                      <span className="bot-switch__thumb" />
                    </button>
                  </div>
                </div>
              ))}
              {settings.popup_enabled !== false && (
                <div className="flex items-center justify-between gap-3">
                  <span className="theme-text font-semibold">Pop-up stays for</span>
                  <div className="flex items-center gap-1" role="group" aria-label="Pop-up duration">
                    {[4, 7, 12, 20].map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => persistSettings({ ...settings, popup_seconds: seconds })}
                        aria-pressed={Number(settings.popup_seconds ?? 7) === seconds}
                        className={`ntf-pill ${Number(settings.popup_seconds ?? 7) === seconds ? 'is-on' : ''}`}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {settingsNotice && <p className="ntf-notice mx-0!">{settingsNotice}</p>}
              <p className="theme-muted pt-1 text-[10px] font-bold uppercase tracking-wider">Mute platforms</p>
              <div className="flex flex-wrap gap-2">
                {['whatsapp', 'facebook', 'instagram'].map((plat) => (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => persistSettings({
                      ...settings,
                      muted_platforms: { ...settings.muted_platforms, [plat]: !settings.muted_platforms?.[plat] },
                    })}
                    className={`ntf-pill ${settings.muted_platforms?.[plat] ? 'is-on' : ''}`}
                    style={{ borderColor: settings.muted_platforms?.[plat] ? undefined : 'var(--line)' }}
                  >
                    {settings.muted_platforms?.[plat] ? '🔕 ' : ''}{platformStyle(plat).label}
                  </button>
                ))}
              </div>
              <p className="theme-muted pt-1 text-[10px] font-bold uppercase tracking-wider">Mute types</p>
              <div className="flex flex-wrap gap-2">
                {['inbox', 'comment', 'media', 'human_request'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => persistSettings({
                      ...settings,
                      muted_types: { ...settings.muted_types, [type]: !settings.muted_types?.[type] },
                    })}
                    className={`ntf-pill ${settings.muted_types?.[type] ? 'is-on' : ''}`}
                    style={{ borderColor: settings.muted_types?.[type] ? undefined : 'var(--line)' }}
                  >
                    {settings.muted_types?.[type] ? '🔕 ' : ''}{type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5 border-b border-(--line) px-3 py-2.5">
            <div className="flex items-center gap-1 overflow-x-auto">
              {PLATFORM_FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatformFilter(id)}
                  className={`ntf-pill ${platformFilter === id ? 'is-on' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {TYPE_FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`ntf-pill ${typeFilter === id ? 'is-on' : ''}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                className={`ntf-pill ${unreadOnly ? 'is-on' : ''}`}
              >
                Unread only
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="ntf-empty">
                <span className="ntf-empty__icon">🔔</span>
                <strong className="theme-text text-sm">You&apos;re all caught up</strong>
                <span>New messages, comments and human requests will show up here.</span>
              </div>
            ) : (
              ['Today', 'Yesterday', 'Earlier'].map((label) =>
                grouped[label]?.length ? (
                  <section key={label}>
                    <h4 className="ntf-group">{label}</h4>
                    {grouped[label].map((item) => {
                      const meta = platformStyle(item.platform)
                      const kind = kindOf(item)
                      return (
                        <article
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          style={platformVars(item.platform)}
                          className={`ntf-item ${!item.is_read ? 'is-unread' : ''} ${kind.key === 'urgent' ? 'is-urgent' : ''}`}
                        >
                          <NotificationAvatar item={item} />
                          <div className="min-w-0 flex-1 pr-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="ntf-item__title">{displayName(item)}</p>
                              <time className="theme-muted shrink-0 text-[10px]">{formatTimeAgo(item.created_at)}</time>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="ntf-chip" style={{ '--ntf-chip': meta.main }}>{meta.label}</span>
                              <span className={`ntf-chip ntf-chip--${kind.key}`}>{kind.icon} {kind.label}</span>
                              {item.customer_username && item.customer_name && (
                                <span className="theme-muted truncate text-[11px]">@{String(item.customer_username).replace(/^@/, '')}</span>
                              )}
                            </div>
                            <p className="ntf-item__text">{item.message_preview}</p>
                          </div>
                          {!item.is_read && <span className="ntf-unread-dot" aria-label="Unread" />}
                          <button
                            type="button"
                            className="ntf-item__delete"
                            onClick={(event) => deleteOne(item.id, event)}
                            aria-label="Delete notification"
                          >
                            ✕
                          </button>
                        </article>
                      )
                    })}
                  </section>
                ) : null
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
