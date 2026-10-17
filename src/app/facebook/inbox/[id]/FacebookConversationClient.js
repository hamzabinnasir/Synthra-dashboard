'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ThemeToggle from '../../../ThemeToggle'
import { FacebookBotToggle } from '../../../DashboardChrome'
import { getConversationDisplayTitles } from '../../../../../lib/conversation-helpers.js'
import MediaMessage from '../../../MediaMessage'
import CustomerAvatar from '../../../CustomerAvatar'
import { useConversationMessages } from '../../../useConversationMessages'

const replyEmojis = ['😀', '😂', '😊', '😍', '👍', '🙏', '🎉', '❤️', '✨', '🚀', '🤖', '💡']

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

export default function FacebookConversationClient({ customer, initialMessages, messagesError, globalBotActive }) {
  const [cust, setCust] = useState(customer)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [sendError, setSendError] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const platform = cust.platform || (cust.psid.startsWith('ig_') ? 'instagram' : 'facebook')
  const channel = platform === 'instagram' ? 'Instagram' : 'Facebook'
  const inboxPath = `/${platform}/inbox`
  const messageLimit = platform === 'instagram' ? 1000 : 1900

  const encodedPsid = encodeURIComponent(customer.psid)
  const {
    messages,
    liveStatus,
    loadError,
    historyLoading,
    retryHistory,
    mergeMessages,
    removeLocally,
    clearLocally,
  } = useConversationMessages({
    conversationId: customer.psid,
    initialMessages,
    initialError: Boolean(messagesError),
    eventsUrl: `/api/conversation/${encodedPsid}/events`,
    messagesUrl: `/api/facebook/inbox/${encodedPsid}/messages`,
    markReadUrl: '/api/conversation/mark-read',
  })

  // Display titles (Headline = customer name / custom name; Sub-headline = username / ID)
  const { headline, subHeadline, initials } = getConversationDisplayTitles(cust, platform)

  // Rename contact name state
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameInput, setRenameInput] = useState(cust.custom_name || cust.name || '')
  const [savingRename, setSavingRename] = useState(false)
  const [renameError, setRenameError] = useState('')

  // The whole chat history is shown in one scrollable thread (no pagination);
  // keep the newest message in view whenever the thread changes.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const [deletingId, setDeletingId] = useState(null)

  const deleteMessage = async (messageId) => {
    if (!messageId || deletingId || !window.confirm('Delete this message?')) return
    setDeletingId(messageId)
    setSendError('')
    try {
      const response = await fetch('/api/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not delete message')
      // Remove from the screen only once the server (Supabase + Cloudinary) confirmed.
      removeLocally(messageId)
    } catch (error) {
      setSendError(error.message || 'Could not delete message')
    } finally {
      setDeletingId(null)
    }
  }

  const sendMessage = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError('')
    try {
      const message = draft.trim()
      const response = await fetch('/api/facebook/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'customer', id: customer.psid, message }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not send Messenger message')
      if (result.message) mergeMessages([result.message])
      setDraft('')
      inputRef.current?.focus()
    } catch (error) {
      setSendError(error.message || 'Could not send Messenger message')
    } finally {
      setSending(false)
    }
  }

  const handleSaveRename = async (e) => {
    e.preventDefault()
    setSavingRename(true)
    setRenameError('')
    try {
      const res = await fetch('/api/conversation/edit-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid: customer.psid, customName: renameInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save name')
      setCust((prev) => ({
        ...prev,
        custom_name: renameInput.trim() || null,
      }))
      setRenameModalOpen(false)
    } catch (err) {
      setRenameError(err.message || 'Error updating name')
    } finally {
      setSavingRename(false)
    }
  }

  const clearChat = async () => {
    if (clearingHistory || !window.confirm(
      `Clear this ${channel} chat history from the dashboard? This removes the stored history and any media files here; it does not unsend messages from ${channel}.`
    )) return

    setClearingHistory(true)
    setSendError('')
    try {
      const response = await fetch('/api/clear-social-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid: customer.psid }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not clear chat history')
      clearLocally()
    } catch (error) {
      setSendError(error.message || 'Could not clear chat history')
    } finally {
      setClearingHistory(false)
    }
  }

  const insertEmoji = (emoji) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? draft.length
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`)
    setEmojiPickerOpen(false)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  return (
    <div className="app-shell chat-page-shell flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="chat-header z-10 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href={inboxPath} aria-label={`Back to ${channel} inbox`} className="theme-link flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition">
            <span aria-hidden="true">←</span>
          </Link>
          <Image src="/synthra-mark.svg" alt="Synthra" width={40} height={40} priority className="h-9 w-9 shrink-0" />
          <div className="hidden min-w-0 lg:block">
            <p className="brand-accent text-[10px] font-bold uppercase">Synthra AI</p>
            <p className="theme-muted text-xs">{channel} messages</p>
          </div>
          <span className="mx-1 hidden h-8 w-px bg-[#263a4e] lg:block" />
          <CustomerAvatar
            src={cust.profile_pic_url}
            initials={initials}
            className="chat-profile-avatar h-9 w-9 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="theme-text truncate text-sm font-semibold sm:text-base">{headline}</h1>
              <button
                type="button"
                onClick={() => {
                  setRenameInput(cust.custom_name || cust.name || '')
                  setRenameModalOpen(true)
                }}
                title="Edit conversation display name"
                className="text-xs opacity-60 hover:opacity-100 hover:text-(--accent) transition p-0.5 cursor-pointer"
              >
                ✏️
              </button>
            </div>
            {subHeadline && subHeadline !== headline && (
              <p className="text-xs font-medium text-(--accent) truncate">{subHeadline}</p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3 lg:gap-4">
          <ThemeToggle />
          <span aria-live="polite" className="theme-muted flex shrink-0 items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${liveStatus === 'live' ? 'animate-pulse bg-[#36e5ad]' : 'bg-[#f5be5b]'}`} />
            <span className="hidden xl:inline">{liveStatus === 'live' ? 'Live' : liveStatus === 'connecting' ? 'Connecting' : 'Syncing'}</span>
          </span>
          <div className="hidden shrink-0 sm:block">
            <FacebookBotToggle target="customer" id={customer.psid} active={customer.bot_active} globalActive={globalBotActive} compact />
          </div>
          <button
            type="button"
            onClick={clearChat}
            disabled={clearingHistory}
            className="chat-bot-toggle shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            {clearingHistory ? 'Clearing...' : 'Clear chat'}
          </button>
        </div>
      </header>

      {/* Rename Modal */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-(--line) bg-(--surface) p-5 shadow-2xl">
            <h2 className="text-sm font-bold text-(--foreground) mb-1">Edit Display Name</h2>
            <p className="text-xs theme-muted mb-4">Set a custom contact name. This will never be overwritten by platform syncs.</p>
            <form onSubmit={handleSaveRename} className="flex flex-col gap-3">
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Enter custom name..."
                className="chat-input rounded-xl px-3 py-2 text-sm outline-none"
                autoFocus
                maxLength={80}
              />
              {renameError && <p className="text-xs text-red-400">{renameError}</p>}
              <div className="flex items-center justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  disabled={savingRename}
                  className="rounded-xl border border-(--line) px-3 py-1.5 text-xs text-(--muted) hover:text-(--foreground)"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRename}
                  className="rounded-xl bg-(--accent) px-4 py-1.5 text-xs font-semibold text-(--accent-text) transition hover:brightness-110 disabled:opacity-50"
                >
                  {savingRename ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sendError && <p role="alert" className="chat-error z-10 border-b px-4 py-2 text-center text-sm">{sendError}</p>}
      {loadError && messages.length > 0 && (
        <p role="status" className="chat-error z-10 border-b px-4 py-2 text-center text-sm">
          Earlier messages could not be loaded yet. Retrying…{' '}
          <button type="button" onClick={retryHistory} className="underline">Retry now</button>
        </p>
      )}

      <main className="chat-thread min-h-0 flex-1 basis-0 overflow-y-auto px-3 py-5 overscroll-y-contain sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:gap-4">
          {messages.length === 0 ? (
            loadError ? (
              <div role="alert" className="py-16 text-center text-sm">
                <p className="text-[#8da2b7]">Could not load this conversation&apos;s history. Retrying automatically…</p>
                <button type="button" onClick={retryHistory} disabled={historyLoading} className="chat-bot-toggle mt-3 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60">
                  {historyLoading ? 'Loading…' : 'Retry now'}
                </button>
              </div>
            ) : historyLoading ? (
              <p className="py-16 text-center text-sm text-[#8da2b7]">Loading conversation…</p>
            ) : (
              <p className="py-16 text-center text-sm text-[#8da2b7]">No messages in this conversation yet.</p>
            )
          ) : messages.map((message, index) => {
            const incoming = message.sender === 'customer'
            const sender = incoming ? headline : message.sender === 'human' ? 'Human agent' : 'Synthra AI'

            return (
              <article key={message.id ?? `${message.created_at}-${index}`} className={`flex w-full ${incoming ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[76%] sm:px-4 ${incoming ? 'chat-bubble--incoming rounded-tl-md' : 'chat-bubble--outgoing rounded-tr-md'}`}>
                  <div className="mb-1 flex items-center justify-between gap-5">
                    <p className={`text-xs font-semibold ${incoming ? 'chat-sender--incoming' : 'chat-sender--outgoing'}`}>{sender}</p>
                    <div className="flex items-center gap-1.5">
                      <time className="chat-time shrink-0 text-[11px]" dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                      {message.id && (
                        <button
                          type="button"
                          title="Delete message"
                          aria-label="Delete message"
                          onClick={() => deleteMessage(message.id)}
                          disabled={deletingId === message.id}
                          className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-400 transition cursor-pointer p-0.5"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Media message rendering (images with lightbox, video, audio, documents) */}
                  {message.media_url && (
                    <MediaMessage message={message} incoming={incoming} />
                  )}

                  {message.text && (
                    <p className="wrap-break-word whitespace-pre-wrap text-sm leading-6 sm:text-[15px]">{message.text}</p>
                  )}
                </div>
              </article>
            )
          })}
          <div ref={endRef} aria-hidden="true" />
        </div>
      </main>

      <footer className="chat-composer relative z-10 shrink-0 px-3 py-3 sm:px-6 sm:py-4">
        <form className="mx-auto flex w-full max-w-4xl items-end gap-2 sm:gap-3" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}>
          <div className="relative shrink-0">
            <button type="button" aria-label="Open emoji picker" aria-expanded={emojiPickerOpen} aria-controls="facebook-reply-emoji-picker" title="Add emoji" onClick={() => setEmojiPickerOpen((open) => !open)} className="emoji-button flex h-11 w-11 items-center justify-center rounded-xl text-xl transition">🙂</button>
            {emojiPickerOpen && (
              <div id="facebook-reply-emoji-picker" className="emoji-panel absolute bottom-14 left-0 z-20 grid w-56 grid-cols-6 gap-1 rounded-2xl p-2 sm:left-auto sm:right-0" aria-label="Choose an emoji">
                {replyEmojis.map((emoji) => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)} className="emoji-choice flex aspect-square items-center justify-center rounded-lg text-xl transition">{emoji}</button>)}
              </div>
            )}
          </div>
          <label className="sr-only" htmlFor="facebook-reply-message">Write an {channel} message</label>
          <textarea
            ref={inputRef}
            id="facebook-reply-message"
            rows={1}
            maxLength={messageLimit}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
            placeholder={`Message this ${channel} customer...`}
            className="chat-input max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-xl px-4 py-3 text-sm outline-none transition"
          />
          <button type="submit" disabled={sending || !draft.trim()} className="chat-send-button h-11 shrink-0 rounded-xl px-4 text-sm font-bold shadow-[0_5px_20px_rgba(17,189,217,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed sm:px-6">
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  )
}
