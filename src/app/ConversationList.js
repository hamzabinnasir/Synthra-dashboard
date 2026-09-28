'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { appUrl } from '@/lib/app-url'

function formatActivity(value) {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ConversationRow({ conversation }) {
  const [botActive, setBotActive] = useState(Boolean(conversation.bot_active))
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const initials = String(conversation.phone_number || 'U').replace(/\D/g, '').slice(-2) || 'U'

  const toggleBot = async () => {
    if (updating) return
    const nextValue = !botActive
    setUpdating(true)
    setError('')

    try {
      const response = await fetch(appUrl('/api/toggle-bot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, botActive: nextValue }),
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

  return (
    <article className="conversation-row">
      <Link href={`/conversation/${conversation.id}`} className="conversation-row__link">
        <span className="conversation-row__avatar" aria-hidden="true">{initials}</span>
        <span className="conversation-row__copy">
          <span className="conversation-row__phone">{conversation.phone_number}</span>
          <span className="conversation-row__lead">{conversation.lead_status || 'No lead status'}</span>
        </span>
      </Link>
      <div className="conversation-row__actions">
        <button
          type="button"
          onClick={toggleBot}
          disabled={updating}
          aria-pressed={botActive}
          aria-label={botActive ? `Pause Synthra AI for ${conversation.phone_number}` : `Activate Synthra AI for ${conversation.phone_number}`}
          className={`conversation-row__toggle ${botActive ? 'is-active' : 'is-inactive'}`}
        >
          <span className="conversation-row__toggle-dot" />
          {updating ? 'Updating' : botActive ? 'Active' : 'Inactive'}
        </button>
        <time className="conversation-row__time">{formatActivity(conversation.last_message_at)}</time>
        {error && <span className="conversation-row__error" role="alert">{error}</span>}
      </div>
    </article>
  )
}

export default function ConversationList({ conversations }) {
  return (
    <div className="conversation-list">
      {conversations.map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} />
      ))}
    </div>
  )
}