'use client'

import { useCallback, useEffect, useState } from 'react'

// Fired (on window) whenever notifications are added, read or removed so the bell
// and the header tabs stay in sync without prop drilling.
export const NOTIFICATIONS_CHANGED = 'notifications:changed'

export function emitNotificationsChanged(origin = 'unknown') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { origin } }))
}

const EMPTY_COUNTS = {}

/** Unread notification counts per header tab: { whatsapp, 'facebook-inbox', ... } */
export function useUnreadCounts() {
  const [counts, setCounts] = useState(EMPTY_COUNTS)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/counts', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      if (data?.success && data.counts) setCounts(data.counts)
    } catch {}
  }, [])

  useEffect(() => {
    let debounce
    const onChanged = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => { void refresh() }, 350)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    const initial = setTimeout(() => { void refresh() }, 0)
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => { void refresh() }, 8000)

    return () => {
      clearTimeout(initial)
      clearTimeout(debounce)
      clearInterval(interval)
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { counts, refresh }
}
