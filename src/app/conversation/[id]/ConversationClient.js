'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { appUrl } from '@/lib/app-url'
import ThemeToggle from '../../ThemeToggle'

function formatMessageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function mergeMessages(currentMessages, newMessages) {
  const existingIds = new Set(currentMessages.map((message) => message.id))
  const uniqueMessages = newMessages.filter((message) => !existingIds.has(message.id))

  return [...currentMessages, ...uniqueMessages].sort(
    (left, right) => new Date(left.created_at) - new Date(right.created_at)
  )
}

const replyEmojis = ['😀', '😂', '😊', '😍', '👍', '🙏', '🎉', '❤️', '✨', '🚀', '🤖', '💡']

export default function ConversationClient({ conversation, initialMessages }) {
  const [messages, setMessages] = useState(initialMessages)
  const [botActive, setBotActive] = useState(conversation.bot_active)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const messagesEndRef = useRef(null)
  const replyInputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  useEffect(() => {
    const eventSource = new EventSource(appUrl(`/api/conversation/${conversation.id}/events`))

    eventSource.addEventListener('ready', () => setLiveStatus('live'))
    eventSource.addEventListener('new-message', (event) => {
      try {
        const incomingMessage = JSON.parse(event.data)
        setMessages((currentMessages) => mergeMessages(currentMessages, [incomingMessage]))
      } catch {
        setLiveStatus('syncing')
      }
    })
    eventSource.addEventListener('realtime-error', () => setLiveStatus('syncing'))
    eventSource.onerror = () => setLiveStatus('syncing')

    return () => {
      eventSource.close()
    }
  }, [conversation.id])

  useEffect(() => {
    if (liveStatus === 'live') return

    let active = true
    let requestPending = false
    let cursor = initialMessages.at(-1)?.created_at || ''

    const syncMessages = async () => {
      if (requestPending) return
      requestPending = true

      try {
        const query = cursor ? `?after=${encodeURIComponent(cursor)}` : ''
        const response = await fetch(appUrl(`/api/conversation/${conversation.id}/messages${query}`), {
          cache: 'no-store',
        })
        if (!response.ok) return

        const { messages: newMessages } = await response.json()
        if (!active || newMessages.length === 0) return

        cursor = newMessages.at(-1).created_at || cursor
        setMessages((currentMessages) => mergeMessages(currentMessages, newMessages))
      } catch {
        setLiveStatus('syncing')
      } finally {
        requestPending = false
      }
    }

    void syncMessages()
    const interval = setInterval(syncMessages, 2500)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [conversation.id, initialMessages, liveStatus])

  const handleToggleBot = async () => {
    if (toggling) return
    const newState = !botActive
    setToggling(true)
    setRequestError('')

    try {
      const response = await fetch(appUrl('/api/toggle-bot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, botActive: newState }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not update bot status')
      setBotActive(newState)
    } catch (error) {
      setRequestError(error.message || 'Could not update bot status')
    } finally {
      setToggling(false)
    }
  }

  const handleSend = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    setRequestError('')

    try {
      const message = replyText.trim()
      const response = await fetch(appUrl('/api/send-message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, message }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not send message')

      const sentMessage = data.message || {
        id: `local-${Date.now()}`,
        sender: 'agent',
        message_text: message,
        created_at: new Date().toISOString(),
      }
      setMessages((currentMessages) => mergeMessages(currentMessages, [sentMessage]))
      setReplyText('')
      setBotActive(false)
      setRequestError(data.warning || '')
    } catch (error) {
      setRequestError(error.message || 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const insertEmoji = (emoji) => {
    const input = replyInputRef.current
    const start = input?.selectionStart ?? replyText.length
    const end = input?.selectionEnd ?? replyText.length

    setReplyText(`${replyText.slice(0, start)}${emoji}${replyText.slice(end)}`)
    setEmojiPickerOpen(false)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  return (
    <div className="app-shell flex h-dvh min-h-112 flex-col overflow-hidden">
      <header className="chat-header z-10 flex shrink-0 items-center justify-between gap-3 border-b px-3 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href="/"
            aria-label="Back to conversations"
            className="theme-link flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition"
          >
            <span aria-hidden="true">←</span>
          </Link>
          <Image src="/synthra-mark.svg" alt="Synthra" width={40} height={40} priority className="h-9 w-9 shrink-0" />
          <div className="hidden min-w-0 sm:block">
            <p className="brand-accent text-[10px] font-bold uppercase">Synthra AI</p>
            <p className="theme-muted text-xs">WhatsApp inbox</p>
          </div>
          <span className="mx-1 hidden h-8 w-px bg-[#263a4e] sm:block" />
          <div className="chat-profile-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {String(conversation.phone_number || 'U').replace(/\D/g, '').slice(-2) || 'U'}
          </div>
          <div className="min-w-0">
            <h1 className="theme-text truncate text-sm font-semibold sm:text-base">{conversation.phone_number}</h1>
            <p className="theme-muted truncate text-xs">{conversation.lead_status || 'Customer'}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <ThemeToggle />
          <span
            aria-live="polite"
            aria-label={liveStatus === 'live' ? 'Live updates connected' : 'Syncing messages'}
            className="theme-muted flex items-center gap-1.5 text-xs"
          >
            <span className={`h-2 w-2 rounded-full ${liveStatus === 'live' ? 'animate-pulse bg-[#36e5ad]' : 'bg-[#f5be5b]'}`} />
            <span className="hidden sm:inline">{liveStatus === 'live' ? 'Live' : liveStatus === 'connecting' ? 'Connecting' : 'Syncing'}</span>
          </span>
          <button
            onClick={handleToggleBot}
            disabled={toggling}
            aria-label={botActive ? 'Pause bot and take over manually' : 'Resume bot replies'}
            aria-pressed={botActive}
            className={`chat-bot-toggle flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:text-sm ${botActive ? 'is-active' : 'is-inactive'}`}
          >
            <span className={`h-2 w-2 rounded-full ${botActive ? 'bg-[#36e5ad]' : 'bg-[#ba8cff]'}`} />
            <span className="hidden sm:inline">{toggling ? 'Updating...' : botActive ? 'Bot active' : 'Manual replies'}</span>
            <span className="sm:hidden">{toggling ? '...' : botActive ? 'Bot' : 'Manual'}</span>
          </button>
        </div>
      </header>

      {requestError && (
        <p role="alert" className="chat-error z-10 border-b px-4 py-2 text-center text-sm">
          {requestError}
        </p>
      )}

      <main className="chat-thread min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:gap-4">
          {messages.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#8da2b7]">No messages in this conversation yet.</p>
          ) : messages.map((msg, index) => {
            const isIncoming = msg.sender === 'user'

            return (
              <article
                key={msg.id ?? `${msg.created_at}-${index}`}
                className={`flex w-full ${isIncoming ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[76%] sm:px-4 ${
                    isIncoming
                      ? 'chat-bubble--incoming rounded-tl-md'
                      : 'chat-bubble--outgoing rounded-tr-md'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-5">
                    <p className={`text-xs font-semibold ${isIncoming ? 'chat-sender--incoming' : 'chat-sender--outgoing'}`}>
                      {isIncoming ? conversation.phone_number : 'Synthra AI'}
                    </p>
                    <time className="chat-time shrink-0 text-[11px]" dateTime={msg.created_at}>
                      {formatMessageTime(msg.created_at)}
                    </time>
                  </div>
                  <p className="wrap-break-word whitespace-pre-wrap text-sm leading-6 sm:text-[15px]">{msg.message_text}</p>
                </div>
              </article>
            )
          })}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
      </main>

      <footer className="chat-composer shrink-0 px-3 py-3 sm:px-6 sm:py-4">
        <form
          className="mx-auto flex w-full max-w-4xl items-end gap-2 sm:gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            handleSend()
          }}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Open emoji picker"
              aria-expanded={emojiPickerOpen}
              aria-controls="reply-emoji-picker"
              title="Add emoji"
              onClick={() => setEmojiPickerOpen((open) => !open)}
              className="emoji-button flex h-11 w-11 items-center justify-center rounded-xl text-xl transition"
            >
              🙂
            </button>
            {emojiPickerOpen && (
              <div
                id="reply-emoji-picker"
                className="emoji-panel absolute bottom-14 left-0 z-20 grid w-56 grid-cols-6 gap-1 rounded-2xl p-2 sm:left-auto sm:right-0"
                aria-label="Choose an emoji"
              >
                {replyEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Insert ${emoji}`}
                    onClick={() => insertEmoji(emoji)}
                    className="emoji-choice flex aspect-square items-center justify-center rounded-lg text-xl transition"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="sr-only" htmlFor="reply-message">Write a message</label>
          <textarea
            ref={replyInputRef}
            id="reply-message"
            rows={1}
            maxLength={4096}
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message Synthra AI..."
            className="chat-input max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-xl px-4 py-3 text-sm outline-none transition"
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            className="chat-send-button h-11 shrink-0 rounded-xl px-4 text-sm font-bold shadow-[0_5px_20px_rgba(17,189,217,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed sm:px-6"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  )
}