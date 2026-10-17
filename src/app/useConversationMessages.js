'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function compareMessages(left, right) {
  const delta = new Date(left.created_at) - new Date(right.created_at)
  if (delta !== 0 && !Number.isNaN(delta)) return delta
  return Number(left.id || 0) - Number(right.id || 0)
}

/** Merges incoming rows into the current list: no duplicates, deleted ids stay deleted. */
export function mergeMessages(current, incoming, deletedIds) {
  const byId = new Map()
  for (const message of current) byId.set(String(message.id), message)
  for (const message of incoming) {
    const key = String(message.id)
    if (deletedIds?.has(key)) continue
    byId.set(key, { ...byId.get(key), ...message })
  }
  return [...byId.values()].sort(compareMessages)
}

const CATCH_UP_OVERLAP_MS = 60 * 1000

/**
 * Keeps one chat thread in sync.
 *  - Shows server-rendered history, and loads it client-side when the server render failed.
 *  - Never hides live messages behind an error: history and live messages are merged.
 *  - Catches up on everything missed whenever the live connection (re)connects.
 *  - Marks the conversation as read (for the unread counter) while the tab is visible.
 */
export function useConversationMessages({
  conversationId,
  initialMessages,
  initialError,
  eventsUrl,
  messagesUrl,
  markReadUrl,
}) {
  const [messages, setMessages] = useState(initialMessages || [])
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [loadError, setLoadError] = useState(Boolean(initialError))
  const [historyLoading, setHistoryLoading] = useState(Boolean(initialError))

  const messagesRef = useRef(messages)
  const deletedRef = useRef(new Set())
  const markTimer = useRef(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const merge = useCallback((incoming) => {
    setMessages((current) => mergeMessages(current, incoming, deletedRef.current))
  }, [])

  const removeLocally = useCallback((messageId) => {
    deletedRef.current.add(String(messageId))
    setMessages((current) => current.filter((m) => String(m.id) !== String(messageId)))
  }, [])

  const clearLocally = useCallback(() => {
    deletedRef.current = new Set()
    setMessages([])
  }, [])

  // Loads the entire history (used on first load failure and by the Retry button).
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await fetch(`${messagesUrl}?full=1`, { cache: 'no-store' })
      if (!response.ok) throw new Error('history request failed')
      const { messages: all } = await response.json()
      merge(all || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setHistoryLoading(false)
    }
  }, [messagesUrl, merge])

  // Fetches only what is newer than the latest message we know (with a safety overlap).
  const catchUp = useCallback(async () => {
    try {
      const latest = messagesRef.current.at(-1)?.created_at
      const latestMs = latest ? new Date(latest).getTime() : NaN
      const query = Number.isNaN(latestMs)
        ? '?full=1'
        : `?after=${encodeURIComponent(new Date(latestMs - CATCH_UP_OVERLAP_MS).toISOString())}`
      const response = await fetch(`${messagesUrl}${query}`, { cache: 'no-store' })
      if (!response.ok) return
      const { messages: fresh } = await response.json()
      if (fresh?.length) merge(fresh)
    } catch {}
  }, [messagesUrl, merge])

  const markRead = useCallback(() => {
    if (!markReadUrl || typeof document === 'undefined' || document.visibilityState !== 'visible') return
    clearTimeout(markTimer.current)
    markTimer.current = setTimeout(() => {
      void fetch(markReadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid: conversationId }),
      }).catch(() => {})
    }, 400)
  }, [markReadUrl, conversationId])

  // First load: if the server could not render the history, fetch it here (and keep retrying).
  useEffect(() => {
    // Also reload when the server page hit Supabase's 1000-row cap (long chat, newest rows cut off).
    if (!initialError && (initialMessages?.length || 0) < 1000) return undefined
    void loadHistory()
    return undefined
  }, [initialError, initialMessages, loadHistory])

  useEffect(() => {
    if (!loadError) return undefined
    const timer = setTimeout(() => { void loadHistory() }, 4000)
    return () => clearTimeout(timer)
  }, [loadError, loadHistory])

  // Opening the chat clears its unread counter.
  useEffect(() => {
    markRead()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        markRead()
        void catchUp()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(markTimer.current)
    }
  }, [markRead, catchUp])

  // Live connection.
  useEffect(() => {
    const eventSource = new EventSource(eventsUrl)

    eventSource.addEventListener('ready', () => {
      setLiveStatus('live')
      // Anything inserted between the page render and now (or while reconnecting) is fetched here.
      void catchUp()
    })
    eventSource.addEventListener('new-message', (event) => {
      try {
        const incoming = JSON.parse(event.data)
        merge([incoming])
        if (incoming.sender === 'customer') markRead()
      } catch {
        setLiveStatus('syncing')
        void catchUp()
      }
    })
    eventSource.addEventListener('message-updated', (event) => {
      try {
        const updated = JSON.parse(event.data)
        setMessages((current) => current.map((m) => (String(m.id) === String(updated.id) ? { ...m, ...updated } : m)))
      } catch {}
    })
    eventSource.addEventListener('message-deleted', (event) => {
      try {
        removeLocally(JSON.parse(event.data).id)
      } catch {
        setLiveStatus('syncing')
      }
    })
    // Re-check with the server: a genuine clear returns an empty thread, a spurious signal restores it.
    eventSource.addEventListener('history-cleared', () => { clearLocally(); void loadHistory() })
    eventSource.addEventListener('realtime-error', () => setLiveStatus('syncing'))
    eventSource.onerror = () => setLiveStatus('syncing')

    return () => eventSource.close()
  }, [eventsUrl, catchUp, merge, markRead, removeLocally, clearLocally, loadHistory])

  // Polling: fast while the live connection is down, slow safety net while it is up.
  useEffect(() => {
    const interval = setInterval(() => { void catchUp() }, liveStatus === 'live' ? 30000 : 2500)
    return () => clearInterval(interval)
  }, [liveStatus, catchUp])

  return {
    messages,
    liveStatus,
    loadError,
    historyLoading,
    retryHistory: loadHistory,
    mergeMessages: merge,
    removeLocally,
    clearLocally,
  }
}
