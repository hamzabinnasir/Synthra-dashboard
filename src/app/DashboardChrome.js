'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ThemeToggle from './ThemeToggle'
import NotificationCenter from './NotificationCenter'
import PaginationControls from './PaginationControls'
import { getConversationDisplayTitles, getCommentDisplayTitles } from '../../lib/conversation-helpers.js'
import CustomerAvatar from './CustomerAvatar'
import { PlatformBadge, StatusChip, humanize, classificationTone, actionTone, formatRelative } from './ChannelBadges'
import MediaMessage from './MediaMessage'
import { useUnreadCounts, emitNotificationsChanged } from './useUnreadCounts'

const sections = [
  { id: 'whatsapp', label: 'WhatsApp', href: '/' },
  { id: 'facebook-inbox', label: 'Facebook Inbox', href: '/facebook/inbox' },
  { id: 'facebook-comments', label: 'Facebook Comments', href: '/facebook/comments' },
  { id: 'instagram-inbox', label: 'Instagram Inbox', href: '/instagram/inbox' },
  { id: 'instagram-comments', label: 'Instagram Comments', href: '/instagram/comments' },
]

function GlobalBotButton({ label, setting, active, connected, onChange }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/facebook/global-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setting, active: !active }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not update setting')
      onChange(!active)
      window.location.reload()
    } catch (toggleError) {
      setError(toggleError.message || 'Could not update setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="theme-muted text-xs">{label}: {connected ? active ? 'Active' : 'Inactive' : 'Not connected'}</span>
      <button
        type="button"
        onClick={toggle}
        disabled={saving || !connected}
        role="switch"
        aria-checked={active}
        aria-label={`${label}: ${active ? 'active' : 'inactive'}`}
        className={`bot-switch ${active ? 'is-on' : 'is-off'}`}
      >
        <span className="bot-switch__thumb" />
      </button>
      {saving && <span className="theme-muted text-xs">Saving...</span>}
      {error && <span role="alert" className="conversation-row__error">{error}</span>}
    </div>
  )
}

export function DashboardHeader({ activeSection, initialSettings }) {
  const settings = initialSettings?.settings || {}
  const [facebookCommentActive, setFacebookCommentActive] = useState(Boolean(settings.comment_bot_active))
  const [facebookInboxActive, setFacebookInboxActive] = useState(Boolean(settings.inbox_bot_active))
  const [instagramCommentActive, setInstagramCommentActive] = useState(Boolean(settings.instagram_comment_bot_active))
  const [instagramInboxActive, setInstagramInboxActive] = useState(Boolean(settings.instagram_inbox_bot_active))
  const [whatsappInboxActive, setWhatsappInboxActive] = useState(Boolean(settings.whatsapp_inbox_bot_active))
  const connected = Boolean(initialSettings?.connected)

  // Unread notification counters shown as red badges on the channel tabs.
  const { counts: unreadCounts } = useUnreadCounts()

  // Opening a tab counts as reading it, so its counter is cleared once, shortly after the page
  // opens. Messages that arrive while you stay on the tab keep their badge until you leave it.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const [platform, area] = activeSection === 'whatsapp' ? ['whatsapp', ''] : activeSection.split('-')
      try {
        await fetch('/api/notifications/mark-all-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, ...(area ? { source: area === 'comments' ? 'comment' : 'inbox' } : {}) }),
        })
      } catch {}
      emitNotificationsChanged('header')
    }, 2500)
    return () => clearTimeout(timer)
  }, [activeSection])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <header className="app-header border-b">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Image src="/synthra-mark.svg" alt="Synthra" width={42} height={42} priority className="h-10 w-10" />
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em]">Synthra</p>
            <p className="brand-accent text-[10px] font-semibold uppercase">AI CONTROL CENTER</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationCenter />
          <ThemeToggle />
          <Link
            href="/profile"
            className="flex items-center gap-1.5 rounded-full border border-(--line) bg-(--surface) px-2.5 py-1 text-xs font-semibold hover:bg-(--surface-raised) transition"
            title="Admin Profile Settings"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-(--accent) text-[10px] font-bold text-(--accent-text)">
              A
            </span>
            <span className="hidden sm:inline">Admin</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full px-2.5 py-1 text-xs text-(--muted) hover:text-(--danger-text) hover:bg-(--danger-bg) transition"
            title="Sign out"
          >
            Logout
          </button>
        </div>

        <nav aria-label="Channels" className="flex w-full flex-wrap items-center gap-2 border-t border-(--line) pt-3 sm:w-auto sm:border-0 sm:pt-0">
          {sections.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              aria-current={activeSection === section.id ? 'page' : undefined}
              aria-label={unreadCounts[section.id] ? `${section.label}, ${unreadCounts[section.id]} unread` : undefined}
              className={`ntf-tab rounded-full px-3 py-2 text-xs font-semibold transition ${
                activeSection === section.id ? 'theme-text bg-(--selected-bg)' : 'theme-muted hover:bg-(--surface-raised)'
              }`}
            >
              {section.label}
              {unreadCounts[section.id] > 0 && (
                <span className="ntf-badge ntf-badge--corner" key={unreadCounts[section.id]}>
                  {unreadCounts[section.id] > 99 ? '99+' : unreadCounts[section.id]}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-(--line)">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <GlobalBotButton label="Facebook Comments Bot" setting="comment_bot_active" active={facebookCommentActive} connected={connected} onChange={setFacebookCommentActive} />
          <GlobalBotButton label="Facebook Inbox Bot" setting="inbox_bot_active" active={facebookInboxActive} connected={connected} onChange={setFacebookInboxActive} />
          <GlobalBotButton label="Instagram Comments Bot" setting="instagram_comment_bot_active" active={instagramCommentActive} connected={connected} onChange={setInstagramCommentActive} />
          <GlobalBotButton label="Instagram Inbox Bot" setting="instagram_inbox_bot_active" active={instagramInboxActive} connected={connected} onChange={setInstagramInboxActive} />
          <GlobalBotButton label="WhatsApp Inbox Bot" setting="whatsapp_inbox_bot_active" active={whatsappInboxActive} connected={connected} onChange={setWhatsappInboxActive} />
        </div>
        {!connected && (
          <p role="status" className="theme-muted mx-auto max-w-6xl px-4 pb-3 text-xs sm:px-6">
            Connect the social inbox Supabase project and apply migrations to enable all controls.
          </p>
        )}
      </div>
    </header>
  )
}

export function FacebookBotToggle({ target, id, active, globalActive = true, compact = false }) {
  const [botActive, setBotActive] = useState(Boolean(active))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/facebook/toggle-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, id, botActive: !botActive }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not update bot status')
      setBotActive(!botActive)
    } catch (toggleError) {
      setError(toggleError.message || 'Could not update bot status')
    } finally {
      setSaving(false)
    }
  }

  const effectiveActive = Boolean(globalActive && botActive)

  return (
    <div className="conversation-row__actions">
      <button
        type="button"
        onClick={toggle}
        disabled={saving || !globalActive}
        role="switch"
        aria-checked={effectiveActive}
        aria-label={`Bot for this conversation: ${effectiveActive ? 'active' : 'inactive'}${!globalActive ? ', paused by global switch' : ''}`}
        className={`bot-switch ${effectiveActive ? 'is-on' : 'is-off'}`}
      >
        <span className="bot-switch__thumb" />
      </button>
      <span className={`theme-muted text-[11px] ${compact ? 'hidden xl:inline' : ''}`}>
        {saving ? 'Saving...' : effectiveActive ? 'Bot: Active' : globalActive ? 'Bot: Inactive' : `Paused globally · saved ${botActive ? 'on' : 'off'}`}
      </span>
      {error && <span role="alert" className="conversation-row__error">{error}</span>}
    </div>
  )
}

// Merges a fresher copy of a record over an existing one, but ignores empty incoming values
// (null / undefined / ''). Realtime events and the background sync can arrive without
// optional fields such as `profile_pic_url`; they must never erase what is already known.
function mergeKeepingValues(existing = {}, incoming = {}) {
  const result = { ...existing }
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value === null || value === undefined || value === '') continue
    result[key] = value
  }
  return result
}

function formatActivity(value) {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function FacebookInboxList({ customers: initialCustomers = [], globalBotActive, platform = 'facebook' }) {
  const channel = platform === 'instagram' ? 'Instagram' : 'Facebook'
  const [customers, setCustomers] = useState(initialCustomers)
  const [prevInitial, setPrevInitial] = useState(initialCustomers)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [deletingPsid, setDeletingPsid] = useState(null)
  const [clearingAll, setClearingAll] = useState(false)

  // 10 records per page pagination
  const PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(1)

  // Inline rename state
  const [editingPsid, setEditingPsid] = useState(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  const startRename = (customer) => {
    setEditingPsid(customer.psid)
    setEditNameValue(customer.custom_name || customer.name || '')
    setNameError('')
  }

  const saveRename = async (psid) => {
    if (savingName) return
    setSavingName(true)
    setNameError('')
    try {
      const res = await fetch('/api/conversation/edit-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, customName: editNameValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save name')
      setCustomers((prev) =>
        prev.map((c) => (c.psid === psid ? { ...c, custom_name: editNameValue.trim() || null } : c))
      )
      setEditingPsid(null)
    } catch (err) {
      setNameError(err.message || 'Error saving name')
    } finally {
      setSavingName(false)
    }
  }

  const deleteSingleCustomer = async (psid, title) => {
    if (deletingPsid) return
    const confirmed = window.confirm(
      `Are you sure you want to delete the conversation with "${title}"?\n\nThis will permanently delete all messages and customer history for ${channel} from Supabase.`
    )
    if (!confirmed) return
    setDeletingPsid(psid)
    try {
      const response = await fetch('/api/delete-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, platform }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not delete conversation')
      }
      setCustomers((prev) => prev.filter((c) => c.psid !== psid))
    } catch (err) {
      alert(`Could not delete conversation: ${err.message}`)
    } finally {
      setDeletingPsid(null)
    }
  }

  const deleteAllCustomers = async () => {
    if (clearingAll || customers.length === 0) return
    const count = customers.length
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete ALL ${count} ${channel} ${count === 1 ? 'conversation' : 'conversations'}?\n\nThis will permanently delete all messages, history, and customer records from Supabase. This action CANNOT be undone.`
    )
    if (!confirmed) return
    setClearingAll(true)
    try {
      const response = await fetch('/api/delete-all-conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not delete all conversations')
      }
      setCustomers([])
    } catch (err) {
      alert(`Could not delete conversations: ${err.message}`)
    } finally {
      setClearingAll(false)
    }
  }

  if (prevInitial !== initialCustomers) {
    setPrevInitial(initialCustomers)
    setCustomers(initialCustomers)
  }

  useEffect(() => {
    const eventSource = new EventSource(`/api/inbox/events?platform=${encodeURIComponent(platform)}`)

    eventSource.onopen = () => setLiveStatus('live')
    eventSource.addEventListener('ready', () => setLiveStatus('live'))

    eventSource.addEventListener('customer-inserted', (event) => {
      try {
        const incoming = JSON.parse(event.data)
        const incomingPlatform = incoming.platform || (
          String(incoming.psid).startsWith('wa_') ? 'whatsapp' :
          String(incoming.psid).startsWith('ig_') ? 'instagram' : 'facebook'
        )
        if (incoming?.psid && (!incomingPlatform || incomingPlatform === platform)) {
          setCustomers((prev) => {
            const existing = prev.find((c) => c.psid === incoming.psid) || {}
            const activityTime = incoming.last_activity_at || existing.last_activity_at || incoming.created_at || new Date().toISOString()
            const merged = {
              ...mergeKeepingValues(existing, incoming),
              // Never overwrite custom_name on sync
              custom_name: existing.custom_name || incoming.custom_name || null,
              last_message_text: incoming.last_message_text || existing.last_message_text || '',
              last_activity_at: activityTime,
            }
            const filtered = prev.filter((c) => c.psid !== incoming.psid)
            return [merged, ...filtered].sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))
          })
        }
      } catch (err) {
        console.error('[inbox-realtime] parse customer-inserted failed', err)
      }
    })

    eventSource.addEventListener('customer-updated', (event) => {
      try {
        const updated = JSON.parse(event.data)
        const updatedPlatform = updated.platform || (
          String(updated.psid).startsWith('wa_') ? 'whatsapp' :
          String(updated.psid).startsWith('ig_') ? 'instagram' : 'facebook'
        )
        if (updated?.psid && (!updatedPlatform || updatedPlatform === platform)) {
          setCustomers((prev) => {
            const existing = prev.find((c) => c.psid === updated.psid) || {}
            const activityTime = updated.last_activity_at || existing.last_activity_at || updated.created_at || new Date().toISOString()
            const merged = {
              ...mergeKeepingValues(existing, updated),
              custom_name: existing.custom_name || updated.custom_name || null,
              last_message_text: updated.last_message_text || existing.last_message_text || '',
              last_activity_at: activityTime,
            }
            const filtered = prev.filter((c) => c.psid !== updated.psid)
            return [merged, ...filtered].sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))
          })
        }
      } catch (err) {
        console.error('[inbox-realtime] parse customer-updated failed', err)
      }
    })

    eventSource.addEventListener('customer-deleted', (event) => {
      try {
        const deleted = JSON.parse(event.data)
        if (deleted?.psid) {
          setCustomers((prev) => prev.filter((c) => c.psid !== deleted.psid))
        }
      } catch (err) {
        console.error('[inbox-realtime] parse customer-deleted failed', err)
      }
    })

    eventSource.addEventListener('all-conversations-deleted', (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (!payload.platform || payload.platform === platform) {
          setCustomers([])
        }
      } catch (err) {
        console.error('[inbox-realtime] parse all-conversations-deleted failed', err)
      }
    })

    eventSource.addEventListener('new-message-activity', (event) => {
      try {
        const msg = JSON.parse(event.data)
        const msgPlatform = msg.platform || (
          String(msg.psid).startsWith('wa_') ? 'whatsapp' :
          String(msg.psid).startsWith('ig_') ? 'instagram' : 'facebook'
        )
        if (msg?.psid && (!msgPlatform || msgPlatform === platform)) {
          setCustomers((prev) => {
            const existing = prev.find((c) => c.psid === msg.psid)
            const activityTime = msg.created_at || new Date().toISOString()
            if (existing) {
              const updated = {
                ...existing,
                last_message_text: msg.text || (msg.media_type ? `[${msg.media_type}]` : 'Media attachment'),
                last_activity_at: activityTime,
              }
              return [updated, ...prev.filter((c) => c.psid !== msg.psid)].sort(
                (a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0)
              )
            } else {
              const displayName = platform === 'instagram' ? String(msg.psid).replace(/^ig_/, '') : msg.psid
              const newConv = {
                psid: msg.psid,
                platform,
                name: displayName || 'New conversation',
                bot_active: true,
                last_message_text: msg.text || (msg.media_type ? `[${msg.media_type}]` : 'Media attachment'),
                last_activity_at: activityTime,
                created_at: activityTime,
              }
              return [newConv, ...prev].sort(
                (a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0)
              )
            }
          })
        }
      } catch (err) {
        console.error('[inbox-realtime] parse new-message-activity failed', err)
      }
    })

    eventSource.addEventListener('realtime-error', () => setLiveStatus('syncing'))
    eventSource.onerror = () => setLiveStatus('syncing')

    return () => {
      eventSource.close()
    }
  }, [platform])

  // Background sync fallback to keep conversations synchronized
  useEffect(() => {
    let active = true

    const syncInbox = async () => {
      try {
        const response = await fetch(`/api/inbox/list?platform=${encodeURIComponent(platform)}`, { cache: 'no-store' })
        if (!response.ok) return
        const result = await response.json()
        if (!active || !result.customers) return
        setCustomers((prev) => {
          const prevMap = new Map(prev.map((c) => [c.psid, c]))
          const serverMap = new Map(result.customers.map((c) => [c.psid, c]))
          const merged = result.customers.map((c) => {
            const local = prevMap.get(c.psid)
            return {
              // Server wins for live fields, but never replace a value we already have with an empty one.
              ...mergeKeepingValues(local, c),
              // Preserve locally edited custom_name if present
              custom_name: local?.custom_name || c.custom_name || null,
            }
          })
          for (const local of prev) {
            if (!serverMap.has(local.psid)) {
              merged.push(local)
            }
          }
          return merged.sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))
        })
        if (liveStatus === 'syncing') {
          setLiveStatus('live')
        }
      } catch {}
    }

    const interval = setInterval(syncInbox, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [platform, liveStatus])

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE))
  // Clamp so deleting the last item of the last page never leaves an empty page behind.
  const activePage = Math.min(currentPage, totalPages)
  const paginatedCustomers = customers.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE)

  return (
    <div className="conversation-list">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className="theme-muted text-xs">
            {customers.length} {customers.length === 1 ? 'conversation' : 'conversations'}
          </span>
          {customers.length > 0 && (
            <button
              type="button"
              onClick={deleteAllCustomers}
              disabled={clearingAll}
              className="delete-all-btn"
              title={`Delete all ${channel} conversations`}
            >
              {clearingAll ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              )}
              <span>{clearingAll ? 'Deleting all...' : 'Delete all'}</span>
            </button>
          )}
        </div>
        <span className="theme-muted flex items-center gap-1.5 text-xs">
          <span className={`h-2 w-2 rounded-full ${liveStatus === 'live' ? 'animate-pulse bg-[#36e5ad]' : 'bg-[#f5be5b]'}`} />
          <span>{liveStatus === 'live' ? 'Live updates' : 'Syncing'}</span>
        </span>
      </div>

      {!customers.length ? (
        <div className="theme-muted border-y py-12 text-center text-sm">No {channel} inbox conversations yet.</div>
      ) : (
        <>
          {paginatedCustomers.map((customer) => {
            const { headline, subHeadline, initials } = getConversationDisplayTitles(customer, platform)
            const isEditing = editingPsid === customer.psid

            return (
              <article className="conversation-row" key={customer.psid}>
                <Link href={`/${platform}/inbox/${encodeURIComponent(customer.psid)}`} className="conversation-row__link">
                  <CustomerAvatar src={customer.profile_pic_url} initials={initials} seed={customer.psid} className="conversation-row__avatar" />
                  <span className="conversation-row__copy">
                    <span className="flex items-center gap-1.5">
                      <span className="conversation-row__phone font-semibold">{headline}</span>
                      {Number(customer.unread_count) > 0 && (
                        <span
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--accent) px-1.5 text-[11px] font-bold text-(--accent-text)"
                          title={`${customer.unread_count} unread ${Number(customer.unread_count) === 1 ? 'message' : 'messages'}`}
                          aria-label={`${customer.unread_count} unread ${Number(customer.unread_count) === 1 ? 'message' : 'messages'}`}
                        >
                          {Number(customer.unread_count) > 99 ? '99+' : customer.unread_count}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (isEditing) setEditingPsid(null)
                          else startRename(customer)
                        }}
                        title="Edit conversation display name"
                        aria-label={`Edit display name for ${headline}`}
                        aria-expanded={isEditing}
                        className="conversation-row__rename"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </span>

                    {/* Sub-headline: show customer username/handle or ID */}
                    {subHeadline && subHeadline !== headline && (
                      <span className="text-[11px] font-medium text-(--accent)">{subHeadline}</span>
                    )}

                    <span className="flex flex-wrap items-center gap-1.5">
                      <PlatformBadge platform={platform} />
                      <StatusChip tone={customer.bot_active ? 'good' : 'warn'}>
                        {customer.bot_active ? 'Bot on' : 'Bot paused'}
                      </StatusChip>
                    </span>
                    <span className="conversation-row__lead">{customer.last_message_text || 'No messages yet'}</span>
                  </span>
                </Link>

                <div className="conversation-row__actions">
                  <span className="theme-muted text-[11px]">Conversation bot</span>
                  <div className="flex items-center gap-2">
                    <FacebookBotToggle target="customer" id={customer.psid} active={customer.bot_active} globalActive={globalBotActive} />
                    <button
                      type="button"
                      onClick={() => deleteSingleCustomer(customer.psid, headline)}
                      disabled={deletingPsid === customer.psid}
                      aria-label={`Delete conversation with ${headline}`}
                      title={`Delete conversation with ${headline}`}
                      className="conversation-row__delete"
                    >
                      {deletingPsid === customer.psid ? (
                        <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <time className="conversation-row__time" title={formatActivity(customer.last_activity_at)}>{formatRelative(customer.last_activity_at) || formatActivity(customer.last_activity_at)}</time>
                </div>

                {/* Rename editor: full-width panel on its own line under the row */}
                {isEditing && (
                  <div className="conversation-row__editor" role="group" aria-label={`Edit display name for ${headline}`}>
                    <div className="conversation-row__editor-head">
                      <label htmlFor={`rename-${customer.psid}`} className="conversation-row__editor-title">Edit display name</label>
                      <span className="conversation-row__editor-hint">Never overwritten by sync</span>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        saveRename(customer.psid)
                      }}
                      className="conversation-row__editor-form"
                    >
                      <input
                        id={`rename-${customer.psid}`}
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingPsid(null)
                        }}
                        placeholder="Enter custom contact name..."
                        className="chat-input conversation-row__editor-input"
                        autoFocus
                        maxLength={80}
                      />
                      <div className="conversation-row__editor-actions">
                        <button type="submit" disabled={savingName} className="conversation-row__editor-save">
                          {savingName ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          disabled={savingName}
                          onClick={() => setEditingPsid(null)}
                          className="conversation-row__editor-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                    {nameError && <p role="alert" className="conversation-row__editor-error">{nameError}</p>}
                  </div>
                )}
              </article>
            )
          })}

          <PaginationControls
            currentPage={activePage}
            totalPages={totalPages}
            totalItems={customers.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            itemLabel="conversations"
          />
        </>
      )}
    </div>
  )
}

// Re-reads the replies of one comment (used after the bot or an agent replies to it).
async function refreshCommentReplies(commentId, setComments) {
  try {
    const response = await fetch(`/api/comments/replies?ids=${encodeURIComponent(commentId)}`, { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    const replies = result?.replies?.[commentId]
    if (!Array.isArray(replies)) return
    setComments((prev) => prev.map((c) => (c.comment_id === commentId ? { ...c, replies } : c)))
  } catch {}
}

const VISIBLE_REPLIES = 3

function CommentReplies({ replies = [] }) {
  const [expanded, setExpanded] = useState(false)
  if (!replies.length) return null

  const collapsed = replies.length > VISIBLE_REPLIES && !expanded
  const visible = collapsed ? replies.slice(-VISIBLE_REPLIES) : replies

  return (
    <span className="mt-1 flex w-full flex-col gap-1.5 border-l-2 border-(--accent) pl-3" aria-label="Previous replies">
      <span className="theme-muted text-[11px] font-semibold uppercase">
        Previous replies ({replies.length})
      </span>
      {visible.map((reply) => (
        <span key={reply.id} className="flex flex-col gap-1 rounded-lg bg-(--surface-raised) px-2.5 py-1.5">
          <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="theme-text font-semibold">{reply.by === 'bot' ? 'Synthra AI' : 'You'}</span>
            <StatusChip tone={reply.kind === 'private' ? 'good' : 'info'}>
              {reply.kind === 'private' ? 'Private reply' : 'Public reply'}
            </StatusChip>
            <span className="theme-muted" title={formatActivity(reply.created_at)}>
              {formatRelative(reply.created_at)}
            </span>
          </span>
          <span className="theme-text wrap-break-word whitespace-pre-wrap text-xs leading-5">{reply.text}</span>
        </span>
      ))}
      {replies.length > VISIBLE_REPLIES && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="w-fit text-[11px] font-semibold text-(--accent) hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${replies.length} replies`}
        </button>
      )}
    </span>
  )
}

export function FacebookCommentsList({ comments: initialComments = [], globalBotActive, platform = 'facebook' }) {
  const channel = platform === 'instagram' ? 'Instagram' : 'Facebook'
  const [comments, setComments] = useState(initialComments)
  const [prevInitial, setPrevInitial] = useState(initialComments)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [clearingAll, setClearingAll] = useState(false)

  // 10 records per page pagination
  const PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(1)

  // Jump to specific comment if navigated from notification hash (e.g. #comment-12345)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash && hash.startsWith('#comment-')) {
      const targetId = hash.replace('#comment-', '')
      const index = comments.findIndex((c) => String(c.comment_id) === targetId)
      if (index !== -1) {
        const targetPage = Math.floor(index / PAGE_SIZE) + 1
        setCurrentPage(targetPage)
        setTimeout(() => {
          const el = document.getElementById(`comment-${targetId}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-cyan-400')
            setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400'), 3500)
          }
        }, 250)
      }
    }
  }, [comments])

  const handleDeleteAllComments = async () => {
    if (clearingAll || comments.length === 0) return
    const count = comments.length
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete ALL ${count} ${channel} ${count === 1 ? 'comment' : 'comments'}?\n\nThis will permanently delete all comments for ${channel} from Supabase and remove them from the dashboard immediately. This action CANNOT be undone.`
    )
    if (!confirmed) return
    setClearingAll(true)
    try {
      const response = await fetch('/api/facebook/delete-all-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not delete all comments')
      }
      setComments([])
    } catch (err) {
      alert(`Could not delete comments: ${err.message}`)
    } finally {
      setClearingAll(false)
    }
  }

  if (prevInitial !== initialComments) {
    setPrevInitial(initialComments)
    setComments(initialComments)
  }

  useEffect(() => {
    const eventSource = new EventSource(`/api/comments/events?platform=${encodeURIComponent(platform)}`)

    eventSource.onopen = () => setLiveStatus('live')
    eventSource.addEventListener('ready', () => setLiveStatus('live'))

    eventSource.addEventListener('new-comment', (event) => {
      try {
        const incoming = JSON.parse(event.data)
        if (incoming && (!incoming.platform || incoming.platform === platform)) {
          setComments((prev) => {
            if (prev.some((c) => c.comment_id === incoming.comment_id)) {
              return prev.map((c) => (c.comment_id === incoming.comment_id ? { ...c, ...incoming } : c))
            }
            return [incoming, ...prev]
          })
        }
      } catch (err) {
        console.error('[comments-realtime] parse new-comment failed', err)
      }
    })

    eventSource.addEventListener('comment-updated', (event) => {
      try {
        const updated = JSON.parse(event.data)
        if (updated?.comment_id) {
          const isDeleted = ['deleted_by_admin', 'deleted_from_facebook', 'deleted_from_instagram'].includes(updated.action)
          if (isDeleted) {
            setComments((prev) => prev.filter((c) => c.comment_id !== updated.comment_id))
          } else {
            setComments((prev) => prev.map((c) => (c.comment_id === updated.comment_id ? { ...c, ...updated } : c)))
            void refreshCommentReplies(updated.comment_id, setComments)
          }
        }
      } catch (err) {
        console.error('[comments-realtime] parse comment-updated failed', err)
      }
    })

    eventSource.addEventListener('comment-deleted', (event) => {
      try {
        const deleted = JSON.parse(event.data)
        if (deleted?.comment_id) {
          setComments((prev) => prev.filter((c) => c.comment_id !== deleted.comment_id))
        }
      } catch (err) {
        console.error('[comments-realtime] parse comment-deleted failed', err)
      }
    })

    eventSource.addEventListener('all-comments-deleted', (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (!payload.platform || payload.platform === platform) {
          setComments([])
        }
      } catch (err) {
        console.error('[comments-realtime] parse all-comments-deleted failed', err)
      }
    })

    eventSource.addEventListener('author-updated', (event) => {
      try {
        const author = JSON.parse(event.data)
        if (!author?.psid) return
        setComments((prev) =>
          prev.some((c) => c.from_id === author.psid)
            ? prev.map((c) =>
                c.from_id === author.psid
                  ? {
                      ...c,
                      author_pic_url: author.profile_pic_url || c.author_pic_url || null,
                      author_custom_name: author.custom_name || null,
                      author_stored_name: author.name || c.author_stored_name || null,
                      author_stored_username: author.username || c.author_stored_username || null,
                    }
                  : c
              )
            : prev
        )
      } catch (err) {
        console.error('[comments-realtime] parse author-updated failed', err)
      }
    })

    eventSource.addEventListener('realtime-error', () => setLiveStatus('syncing'))
    eventSource.onerror = () => setLiveStatus('syncing')

    return () => {
      eventSource.close()
    }
  }, [platform])

  const handleDeleteLocally = (commentId) => {
    setComments((prev) => prev.filter((c) => c.comment_id !== commentId))
  }

  // Show a reply sent from this page straight away; it is re-synced from the database later.
  const handleReplied = (commentId, reply) => {
    setComments((prev) =>
      prev.map((c) => (c.comment_id === commentId ? { ...c, replies: [...(c.replies || []), reply] } : c))
    )
  }

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(comments.length / PAGE_SIZE))
  // Clamp so deleting the last item of the last page never leaves an empty page behind.
  const activePage = Math.min(currentPage, totalPages)
  const paginatedComments = comments.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE)

  return (
    <div className="conversation-list">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className="theme-muted text-xs">
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </span>
          {comments.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllComments}
              disabled={clearingAll}
              className="delete-all-btn"
              title={`Delete all ${channel} comments`}
            >
              {clearingAll ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              )}
              <span>{clearingAll ? 'Deleting all...' : 'Delete all'}</span>
            </button>
          )}
        </div>
        <span className="theme-muted flex items-center gap-1.5 text-xs">
          <span className={`h-2 w-2 rounded-full ${liveStatus === 'live' ? 'animate-pulse bg-[#36e5ad]' : 'bg-[#f5be5b]'}`} />
          <span>{liveStatus === 'live' ? 'Live updates' : 'Syncing'}</span>
        </span>
      </div>

      {!comments.length ? (
        <div className="theme-muted border-y py-12 text-center text-sm">No {channel} comments yet.</div>
      ) : (
        <>
          {paginatedComments.map((comment) => {
            const { headline, subHeadline, initials } = getCommentDisplayTitles(comment, platform)

            return (
              <article className="conversation-row transition duration-200" key={comment.comment_id} id={`comment-${comment.comment_id}`}>
                <div className="conversation-row__link">
                  <CustomerAvatar src={comment.author_pic_url} initials={initials} seed={comment.from_id} className="conversation-row__avatar" />
                  <span className="conversation-row__copy">
                    <span className="conversation-row__phone font-semibold">{headline}</span>

                    {/* Sub-headline: username or author ID */}
                    {subHeadline && subHeadline !== headline && (
                      <span className="text-[11px] font-medium text-(--accent)">{subHeadline}</span>
                    )}

                    <span className="flex flex-wrap items-center gap-1.5">
                      <PlatformBadge platform={platform} />
                      <StatusChip tone={classificationTone(comment.classification || comment.tone)}>
                        {humanize(comment.classification || comment.tone) || 'Unclassified'}
                      </StatusChip>
                      <StatusChip tone={actionTone(comment.action)}>{humanize(comment.action) || 'Pending'}</StatusChip>
                      {comment.private_reply_sent && <StatusChip tone="good">Private reply sent</StatusChip>}
                      <span className="theme-muted text-[11px]" title={formatActivity(comment.created_at)}>
                        {formatRelative(comment.created_at)}
                      </span>
                    </span>
                    <span className="conversation-row__lead" style={{ whiteSpace: 'normal' }}>{comment.message || '[No text]'}</span>
                    <span className="conversation-row__lead break-all">
                      Comment ID: {platform === 'instagram' && comment.comment_id?.startsWith('ig_') ? comment.comment_id.slice(3) : comment.comment_id || 'Unavailable'}
                    </span>
                    <span className="conversation-row__lead break-all">
                      Post ID: {platform === 'instagram' && comment.post_id?.startsWith('ig_') ? comment.post_id.slice(3) : comment.post_id || 'Unavailable'}
                    </span>
                    <span className="conversation-row__lead break-all">
                      Commenter ID: {comment.from_id ? (platform === 'instagram' && comment.from_id.startsWith('ig_') ? comment.from_id.slice(3) : comment.from_id) : 'Unavailable'}
                    </span>
                    {comment.from_id && (
                      <Link
                        href={`/${platform}/inbox/${encodeURIComponent(comment.from_id)}`}
                        className="text-[11px] font-semibold text-(--accent) hover:underline"
                      >
                        Open conversation with this person →
                      </Link>
                    )}
                    <CommentReplies replies={comment.replies || []} />
                    {comment.action === 'deleted_by_admin' && <span className="theme-muted text-xs">Deleted from {channel}</span>}
                  </span>
                </div>
                <div className="conversation-row__actions">
                  <span className="theme-muted text-[11px]">Comment automation {globalBotActive ? 'active' : 'paused'} globally</span>
                  <FacebookCommentActions comment={comment} onDeleted={handleDeleteLocally} onReplied={handleReplied} />
                </div>
              </article>
            )
          })}

          <PaginationControls
            currentPage={activePage}
            totalPages={totalPages}
            totalItems={comments.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            itemLabel="comments"
          />
        </>
      )}
    </div>
  )
}

function FacebookCommentActions({ comment, onDeleted, onReplied }) {
  const [mode, setMode] = useState('public')
  const [draft, setDraft] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [replyError, setReplyError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleted, setDeleted] = useState(['deleted_by_admin', 'deleted_from_facebook', 'deleted_from_instagram'].includes(comment.action))
  const [privateReplySent, setPrivateReplySent] = useState(Boolean(comment.private_reply_sent))

  const sendReply = async (event) => {
    event.preventDefault()
    if (!draft.trim() || working) return
    setWorking(true)
    setReplyError('')
    setNotice('')
    try {
      const response = await fetch('/api/facebook/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'comment', id: comment.comment_id, mode, message: draft.trim() }),
      })
      const result = await response.json()
      if (result.privateReplySent) setPrivateReplySent(true)
      if (result.deleted) {
        setDeleted(true)
        onDeleted?.(comment.comment_id)
      }
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not send reply')
      onReplied?.(comment.comment_id, {
        id: `local-${Date.now()}`,
        kind: mode,
        by: 'human',
        text: draft.trim(),
        created_at: new Date().toISOString(),
      })
      setDraft('')
      setNotice(result.warning || (mode === 'private' ? 'Private inbox reply sent with a public reminder.' : 'Public comment reply posted.'))
    } catch (sendError) {
      setReplyError(`${mode === 'private' ? 'Private reply failed' : 'Public reply failed'}: ${sendError.message || 'Could not send reply'}`)
    } finally {
      setWorking(false)
    }
  }

  const deleteComment = async () => {
    const channel = comment.platform === 'instagram' ? 'Instagram' : 'Facebook'
    if (working || deleted || !window.confirm(`Delete this comment from ${channel}?`)) return
    setWorking(true)
    setDeleteError('')
    setNotice('')
    try {
      const response = await fetch('/api/facebook/delete-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.comment_id }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not delete comment')
      setDeleted(true)
      onDeleted?.(comment.comment_id)
      setNotice(result.message || `Comment deleted from ${channel}.`)
    } catch (deleteError) {
      setDeleteError(`Comment deletion failed: ${deleteError.message || 'Could not delete comment'}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="facebook-comment-actions">
      <form onSubmit={sendReply} className="flex w-64 max-w-[36vw] flex-col gap-2">
        <select aria-label="Comment reply visibility" value={mode} onChange={(event) => setMode(event.target.value)} className="chat-input rounded-lg px-2 py-1 text-xs">
          <option value="private" disabled={privateReplySent}>Private inbox reply{privateReplySent ? ' (already sent)' : ''}</option>
          <option value="public">Public comment reply</option>
        </select>
        <textarea aria-label={`Reply to ${comment.platform === 'instagram' ? 'Instagram' : 'Facebook'} comment`} maxLength={comment.platform === 'instagram' ? 1000 : 1900} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply..." className="chat-input min-w-0 resize-y rounded-lg px-2 py-2 text-xs" />
        <button type="submit" disabled={working || !draft.trim() || deleted || (mode === 'private' && privateReplySent)} className="conversation-row__toggle is-active disabled:opacity-60">
          {working ? 'Sending...' : 'Send reply'}
        </button>
        {replyError && <span role="alert" className="conversation-row__error">{replyError}</span>}
      </form>
      <button type="button" disabled={working || deleted} onClick={deleteComment} className="conversation-row__toggle is-inactive disabled:opacity-60">
        {deleted ? 'Deleted' : working ? 'Working...' : 'Delete comment'}
      </button>
      {deleteError && <span role="alert" className="conversation-row__error">{deleteError}</span>}
      {notice && <span role="status" className="theme-muted max-w-64 text-right text-[11px]">{notice}</span>}
    </div>
  )
}

export function FacebookMessageHistory({ customer, messages: initialMessages, error, globalBotActive }) {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const { headline, subHeadline } = getConversationDisplayTitles(customer, customer.platform || 'facebook')

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError('')
    try {
      const response = await fetch('/api/facebook/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'customer', id: customer.psid, message: draft.trim() }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not send Messenger message')
      if (result.message) setMessages((current) => [...current, result.message])
      setDraft('')
    } catch (error) {
      setSendError(error.message || 'Could not send Messenger message')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/facebook/inbox" className="theme-link mb-5 inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-sm">
        <span aria-hidden="true">←</span> Back to Facebook inbox
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-(--line) pb-4">
        <div className="min-w-0">
          <h1 className="theme-text truncate text-xl font-semibold">{headline}</h1>
          {subHeadline && subHeadline !== headline && (
            <p className="text-xs font-medium text-(--accent)">{subHeadline}</p>
          )}
        </div>
        <div className="conversation-row__actions">
          <span className="theme-muted text-[11px]">Conversation bot</span>
          <FacebookBotToggle target="customer" id={customer.psid} active={customer.bot_active} globalActive={globalBotActive} />
        </div>
      </div>
      <section aria-label="Facebook Messenger conversation history" className="chat-thread min-h-0 flex-1 overflow-y-auto rounded-xl border border-(--line) px-3 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:gap-4">
          {error ? (
            <p role="alert" className="chat-error rounded-xl border p-4 text-sm">Unable to load messages.</p>
          ) : messages.length === 0 ? (
            <p className="theme-muted py-16 text-center text-sm">No messages in this conversation yet.</p>
          ) : messages.map((message, index) => {
            const incoming = message.sender === 'customer'
            const sender = incoming ? headline : message.sender === 'human' ? 'Human agent' : 'Synthra AI'
            return (
              <article key={message.id ?? `${message.created_at}-${index}`} className={`flex w-full ${incoming ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[76%] sm:px-4 ${incoming ? 'chat-bubble--incoming rounded-tl-md' : 'chat-bubble--outgoing rounded-tr-md'}`}>
                  <div className="mb-1 flex items-center justify-between gap-5">
                    <p className={`text-xs font-semibold ${incoming ? 'chat-sender--incoming' : 'chat-sender--outgoing'}`}>{sender}</p>
                    <time className="chat-time shrink-0 text-[11px]" dateTime={message.created_at}>{formatActivity(message.created_at)}</time>
                  </div>
                  {/* Media attachment if present */}
                  {message.media_url && <MediaMessage message={message} incoming={incoming} />}
                  {message.text && (
                    <p className="wrap-break-word whitespace-pre-wrap text-sm leading-6 sm:text-[15px]">{message.text}</p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
      <form onSubmit={sendMessage} className="chat-composer mt-3 flex shrink-0 items-end gap-2 rounded-xl border px-3 py-3 sm:gap-3 sm:px-4">
        <label className="sr-only" htmlFor="facebook-message">Message this Facebook conversation</label>
        <textarea id="facebook-message" rows={1} maxLength={1900} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message this customer..." className="chat-input min-h-11 min-w-0 flex-1 resize-y rounded-xl px-4 py-3 text-sm outline-none" />
        <button type="submit" disabled={sending || !draft.trim()} className="chat-send-button h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-50">
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
      {sendError && <p role="alert" className="chat-error mt-2 rounded-lg border px-3 py-2 text-sm">{sendError}</p>}
    </main>
  )
}