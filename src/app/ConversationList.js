'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { appUrl } from '@/lib/app-url'
import { getConversationDisplayTitles } from '../../lib/conversation-helpers.js'
import PaginationControls from './PaginationControls'
import CustomerAvatar from './CustomerAvatar'
import { PlatformBadge, StatusChip, formatRelative } from './ChannelBadges'

// Merges a fresher copy over an existing record but ignores empty incoming values, so realtime
// events and the background sync can never erase a known profile photo or name.
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

function ConversationRow({ conversation, onDelete, onUpdateCustomer }) {
  const [botActive, setBotActive] = useState(Boolean(conversation.bot_active))
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // Rename modal / inline editor
  const [isEditingName, setIsEditingName] = useState(false)
  const [customNameInput, setCustomNameInput] = useState(conversation.custom_name || conversation.name || '')
  const [savingName, setSavingName] = useState(false)

  const psid = conversation.psid
  const { headline, subHeadline, initials } = getConversationDisplayTitles(conversation, 'whatsapp')

  const toggleBot = async () => {
    if (updating) return
    const nextValue = !botActive
    setUpdating(true)
    setError('')

    try {
      const response = await fetch(appUrl('/api/toggle-bot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, botActive: nextValue }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not update bot status')
      }
      setBotActive(nextValue)
    } catch (toggleError) {
      setError(toggleError.message || 'Could not update bot status')
    } finally {
      setUpdating(false)
    }
  }

  const deleteConversation = async () => {
    if (deleting) return
    const confirmed = window.confirm(
      `Are you sure you want to delete the conversation with "${headline}"?\n\nThis will permanently delete all messages and customer history from Supabase.`
    )
    if (!confirmed) return
    setDeleting(true)
    setError('')
    try {
      const response = await fetch('/api/delete-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, platform: conversation.platform || 'whatsapp' }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not delete conversation')
      }
      onDelete?.(psid)
    } catch (err) {
      setError(err.message || 'Could not delete conversation')
      setDeleting(false)
    }
  }

  const handleSaveCustomName = async (e) => {
    e.preventDefault()
    setSavingName(true)
    setError('')
    try {
      const res = await fetch('/api/conversation/edit-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, customName: customNameInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not save name')
      }
      setIsEditingName(false)
      onUpdateCustomer?.(psid, { custom_name: customNameInput.trim() || null })
    } catch (err) {
      setError(err.message || 'Could not save name')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <article className="conversation-row">
      <Link href={`/conversation/${encodeURIComponent(psid)}`} className="conversation-row__link">
        <CustomerAvatar src={conversation.profile_pic_url} initials={initials} seed={conversation.psid} className="conversation-row__avatar" />
        <span className="conversation-row__copy">
          <span className="flex items-center gap-2">
            <span className="conversation-row__phone">{headline}</span>
            {Number(conversation.unread_count) > 0 && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--accent) px-1.5 text-[11px] font-bold text-(--accent-text)"
                title={`${conversation.unread_count} unread ${Number(conversation.unread_count) === 1 ? 'message' : 'messages'}`}
                aria-label={`${conversation.unread_count} unread ${Number(conversation.unread_count) === 1 ? 'message' : 'messages'}`}
              >
                {Number(conversation.unread_count) > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
          </span>
          {subHeadline && <span className="conversation-row__lead">{subHeadline}</span>}
          <span className="flex flex-wrap items-center gap-1.5">
            <PlatformBadge platform="whatsapp" />
            <StatusChip tone={botActive ? 'good' : 'warn'}>{botActive ? 'Bot on' : 'Bot paused'}</StatusChip>
          </span>
          {conversation.last_message_text && (
            <span className="conversation-row__lead truncate">{conversation.last_message_text}</span>
          )}
        </span>
      </Link>

      <div className="conversation-row__actions">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditingName((open) => !open)}
            title="Edit conversation display name"
            aria-label={`Edit display name for ${headline}`}
            aria-expanded={isEditingName}
            className="conversation-row__rename"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggleBot}
            disabled={updating}
            aria-pressed={botActive}
            aria-label={`${botActive ? 'Disable' : 'Enable'} Synthra AI for ${headline}`}
            className={`conversation-row__toggle ${botActive ? 'is-active' : 'is-inactive'}`}
          >
            <span className="conversation-row__toggle-dot" />
            {updating ? 'Updating' : botActive ? 'Disable' : 'Enable'}
          </button>

          <button
            type="button"
            onClick={deleteConversation}
            disabled={deleting}
            aria-label={`Delete conversation with ${headline}`}
            title={`Delete conversation with ${headline}`}
            className="conversation-row__delete"
          >
            {deleting ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            )}
          </button>
        </div>

        <time className="conversation-row__time" title={formatActivity(conversation.last_activity_at)}>{formatRelative(conversation.last_activity_at) || formatActivity(conversation.last_activity_at)}</time>
        {error && <span className="conversation-row__error" role="alert">{error}</span>}
      </div>

      {/* Rename editor: full-width panel on its own line under the row */}
      {isEditingName && (
        <div className="conversation-row__editor" role="group" aria-label={`Edit display name for ${headline}`}>
          <div className="conversation-row__editor-head">
            <label htmlFor={`rename-${psid}`} className="conversation-row__editor-title">Edit display name</label>
            <span className="conversation-row__editor-hint">Never overwritten by sync</span>
          </div>
          <form onSubmit={handleSaveCustomName} className="conversation-row__editor-form">
            <input
              id={`rename-${psid}`}
              type="text"
              value={customNameInput}
              onChange={(e) => setCustomNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsEditingName(false)
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
                onClick={() => setIsEditingName(false)}
                className="conversation-row__editor-cancel"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </article>
  )
}

const PAGE_SIZE = 10

export default function ConversationList({ conversations: initialConversations = [] }) {
  const [conversations, setConversations] = useState(initialConversations)
  const [prevInitial, setPrevInitial] = useState(initialConversations)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [clearingAll, setClearingAll] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(conversations.length / PAGE_SIZE))

  // Ensure valid page if list changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage])

  const handleDeleteOne = (psid) => {
    setConversations((prev) => prev.filter((c) => c.psid !== psid))
  }

  const handleUpdateCustomer = (psid, patch) => {
    setConversations((prev) =>
      prev.map((c) => (c.psid === psid ? { ...c, ...patch } : c))
    )
  }

  const handleDeleteAll = async () => {
    if (clearingAll || conversations.length === 0) return
    const count = conversations.length
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete ALL ${count} WhatsApp ${count === 1 ? 'conversation' : 'conversations'}?\n\nThis will permanently delete all messages, history, and customer records from Supabase. This action CANNOT be undone.`
    )
    if (!confirmed) return
    setClearingAll(true)
    try {
      const response = await fetch('/api/delete-all-conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'whatsapp' }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not delete all conversations')
      }
      setConversations([])
    } catch (err) {
      alert(`Could not delete conversations: ${err.message}`)
    } finally {
      setClearingAll(false)
    }
  }

  if (prevInitial !== initialConversations) {
    setPrevInitial(initialConversations)
    setConversations(initialConversations)
  }

  useEffect(() => {
    const eventSource = new EventSource('/api/inbox/events?platform=whatsapp')

    eventSource.onopen = () => setLiveStatus('live')
    eventSource.addEventListener('ready', () => setLiveStatus('live'))

    eventSource.addEventListener('customer-inserted', (event) => {
      try {
        const incoming = JSON.parse(event.data)
        const incomingPlatform = incoming.platform || (String(incoming.psid).startsWith('wa_') ? 'whatsapp' : '')
        if (incoming?.psid && (!incomingPlatform || incomingPlatform === 'whatsapp')) {
          setConversations((prev) => {
            const existing = prev.find((c) => c.psid === incoming.psid) || {}
            const activityTime = incoming.last_activity_at || existing.last_activity_at || incoming.created_at || new Date().toISOString()
            const merged = {
              ...mergeKeepingValues(existing, incoming),
              last_message_text: incoming.last_message_text || existing.last_message_text || '',
              last_activity_at: activityTime,
            }
            const filtered = prev.filter((c) => c.psid !== incoming.psid)
            return [merged, ...filtered].sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))
          })
        }
      } catch (err) {
        console.error('[whatsapp-inbox-realtime] parse customer-inserted failed', err)
      }
    })

    eventSource.addEventListener('customer-updated', (event) => {
      try {
        const updated = JSON.parse(event.data)
        const updatedPlatform = updated.platform || (String(updated.psid).startsWith('wa_') ? 'whatsapp' : '')
        if (updated?.psid && (!updatedPlatform || updatedPlatform === 'whatsapp')) {
          setConversations((prev) => {
            const existing = prev.find((c) => c.psid === updated.psid) || {}
            const activityTime = updated.last_activity_at || existing.last_activity_at || updated.created_at || new Date().toISOString()
            const merged = {
              ...mergeKeepingValues(existing, updated),
              last_message_text: updated.last_message_text || existing.last_message_text || '',
              last_activity_at: activityTime,
            }
            const filtered = prev.filter((c) => c.psid !== updated.psid)
            return [merged, ...filtered].sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))
          })
        }
      } catch (err) {
        console.error('[whatsapp-inbox-realtime] parse customer-updated failed', err)
      }
    })

    eventSource.addEventListener('customer-deleted', (event) => {
      try {
        const deleted = JSON.parse(event.data)
        if (deleted?.psid) {
          setConversations((prev) => prev.filter((c) => c.psid !== deleted.psid))
        }
      } catch (err) {
        console.error('[whatsapp-inbox-realtime] parse customer-deleted failed', err)
      }
    })

    eventSource.addEventListener('all-conversations-deleted', (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (!payload.platform || payload.platform === 'whatsapp') {
          setConversations([])
        }
      } catch (err) {
        console.error('[whatsapp-inbox-realtime] parse all-conversations-deleted failed', err)
      }
    })

    eventSource.addEventListener('new-message-activity', (event) => {
      try {
        const msg = JSON.parse(event.data)
        const msgPlatform = msg.platform || (String(msg.psid).startsWith('wa_') ? 'whatsapp' : '')
        if (msg?.psid && (!msgPlatform || msgPlatform === 'whatsapp')) {
          setConversations((prev) => {
            const existing = prev.find((c) => c.psid === msg.psid)
            const activityTime = msg.created_at || new Date().toISOString()
            if (existing) {
              const updated = {
                ...existing,
                last_message_text: msg.text,
                last_activity_at: activityTime,
              }
              return [updated, ...prev.filter((c) => c.psid !== msg.psid)].sort(
                (a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0)
              )
            } else {
              const phone = String(msg.psid || '').replace(/^wa_/, '')
              const newConv = {
                psid: msg.psid,
                platform: 'whatsapp',
                name: phone || 'New lead',
                username: phone,
                bot_active: true,
                last_message_text: msg.text,
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
        console.error('[whatsapp-inbox-realtime] parse new-message-activity failed', err)
      }
    })

    eventSource.addEventListener('realtime-error', () => setLiveStatus('syncing'))
    eventSource.onerror = () => setLiveStatus('syncing')

    return () => {
      eventSource.close()
    }
  }, [])

  // Background sync fallback
  useEffect(() => {
    let active = true

    const syncInbox = async () => {
      try {
        const response = await fetch('/api/inbox/list?platform=whatsapp', { cache: 'no-store' })
        if (!response.ok) return
        const result = await response.json()
        if (!active || !result.customers) return
        setConversations((prev) => {
          const prevMap = new Map(prev.map((c) => [c.psid, c]))
          const serverMap = new Map(result.customers.map((c) => [c.psid, c]))
          // Keep known values (profile photo, custom name) when the server copy has an empty one.
          const merged = result.customers.map((c) => mergeKeepingValues(prevMap.get(c.psid), c))
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
  }, [liveStatus])

  // Paginated slice
  const paginatedConversations = conversations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  return (
    <div className="conversation-list">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className="theme-muted text-xs">
            {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
          </span>
          {conversations.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={clearingAll}
              className="delete-all-btn"
              title="Delete all WhatsApp conversations"
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

      {conversations.length === 0 ? (
        <div className="theme-muted border-y py-12 text-center text-sm">
          No conversations yet.
        </div>
      ) : (
        <>
          {paginatedConversations.map((conversation) => (
            <ConversationRow
              key={conversation.psid}
              conversation={conversation}
              onDelete={handleDeleteOne}
              onUpdateCustomer={handleUpdateCustomer}
            />
          ))}

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={conversations.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            itemLabel="conversations"
          />
        </>
      )}
    </div>
  )
}