'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { appUrl } from '@/lib/app-url'
import ThemeToggle from '../../ThemeToggle'
import { getConversationDisplayTitles } from '../../../../lib/conversation-helpers.js'
import MediaMessage from '../../MediaMessage'
import CustomerAvatar from '../../CustomerAvatar'
import { useConversationMessages } from '../../useConversationMessages'

function formatMessageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const replyEmojis = ['😀', '😂', '😊', '😍', '👍', '🙏', '🎉', '❤️', '✨', '🚀', '🤖', '💡']

// Mirrors what WhatsApp (and /api/send-media) accepts; the server re-validates everything.
const ATTACH_ACCEPT = '.jpg,.jpeg,.png,.mp4,.3gp,.aac,.m4a,.mp3,.amr,.ogg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'
const MAX_ATTACH_BYTES = 10 * 1024 * 1024

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ConversationClient({ conversation, initialMessages, initialError = false }) {
  const [conv, setConv] = useState(conversation)
  const conversationId = conv.psid

  // Headline and sub-headline formatting (customer name as main headline, phone/username as sub-headline)
  const { headline, subHeadline, initials } = getConversationDisplayTitles(conv, 'whatsapp')

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
    conversationId,
    initialMessages,
    initialError,
    eventsUrl: appUrl(`/api/conversation/${conversationId}/events`),
    messagesUrl: appUrl(`/api/conversation/${conversationId}/messages`),
    markReadUrl: appUrl('/api/conversation/mark-read'),
  })

  const [botActive, setBotActive] = useState(conv.bot_active)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const messagesEndRef = useRef(null)
  const replyInputRef = useRef(null)

  // File attachment (sent via /api/send-media -> Cloudinary -> WhatsApp)
  const [attachment, setAttachment] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState('')
  const fileInputRef = useRef(null)

  // Rename contact modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameInput, setRenameInput] = useState(conv.custom_name || conv.name || '')
  const [savingRename, setSavingRename] = useState(false)
  const [renameError, setRenameError] = useState('')

  // The whole chat history is shown in one scrollable thread (no pagination);
  // keep the newest message in view whenever the thread changes.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const [deletingId, setDeletingId] = useState(null)

  const handleDeleteMessage = async (messageId) => {
    if (!messageId || deletingId || !window.confirm('Delete this message?')) return
    setDeletingId(messageId)
    setRequestError('')
    try {
      const response = await fetch(appUrl('/api/delete-message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not delete message')
      // Remove from the screen only once the server (Supabase + Cloudinary) confirmed.
      removeLocally(messageId)
    } catch (error) {
      setRequestError(error.message || 'Could not delete message')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleBot = async () => {
    if (toggling) return
    const newState = !botActive
    setToggling(true)
    setRequestError('')

    try {
      const response = await fetch(appUrl('/api/toggle-bot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          psid: conversationId,
          botActive: newState,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not update bot status')
      }

      setBotActive(newState)
    } catch (error) {
      setRequestError(error.message || 'Could not update bot status')
    } finally {
      setToggling(false)
    }
  }

  const handleClearHistory = async () => {
    if (clearingHistory || !window.confirm(
      `Clear this WhatsApp chat history from the dashboard? This removes the stored history and any media files here; it does not delete messages from WhatsApp.`
    )) {
      return
    }

    setClearingHistory(true)
    setRequestError('')

    try {
      // Dedicated WhatsApp route (the old '/api/clear-history' path does not exist).
      const response = await fetch(appUrl('/api/clear-whatsapp-history'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid: conversationId }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not clear chat history')
      }

      clearLocally()
    } catch (error) {
      setRequestError(error.message || 'Could not clear chat history')
    } finally {
      setClearingHistory(false)
    }
  }

  const handleSaveRename = async (e) => {
    e.preventDefault()
    setSavingRename(true)
    setRenameError('')
    try {
      const res = await fetch(appUrl('/api/conversation/edit-name'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid: conversationId, customName: renameInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save name')
      setConv((prev) => ({
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

  const clearAttachment = () => {
    setAttachment(null)
    setAttachmentPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return ''
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelected = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setRequestError('')

    if (file.size > MAX_ATTACH_BYTES) {
      setRequestError(`That file is ${formatFileSize(file.size)}. The maximum is ${formatFileSize(MAX_ATTACH_BYTES)}.`)
      event.target.value = ''
      return
    }

    setAttachmentPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    })
    setAttachment(file)
  }

  const handleSend = async () => {
    const trimmed = replyText.trim()
    if ((!trimmed && !attachment) || sending) return

    setSending(true)
    setRequestError('')

    try {
      let response
      if (attachment) {
        // File path: browser -> /api/send-media -> Cloudinary -> WhatsApp, then saved to the chat.
        const formData = new FormData()
        formData.set('psid', conversationId)
        formData.set('file', attachment)
        if (trimmed) formData.set('caption', trimmed)
        response = await fetch(appUrl('/api/send-media'), { method: 'POST', body: formData })
      } else {
        response = await fetch(appUrl('/api/send-message'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            psid: conversationId,
            message: trimmed,
          }),
        })
      }

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || (attachment ? 'Could not send file' : 'Could not send message'))
      }

      if (data.message) {
        mergeMessages([data.message])
      }

      if (attachment) clearAttachment()
      setReplyText('')
      replyInputRef.current?.focus()
    } catch (error) {
      setRequestError(error.message || (attachment ? 'Could not send file' : 'Could not send message'))
    } finally {
      setSending(false)
    }
  }

  const handleEmojiSelect = (emoji) => {
    const input = replyInputRef.current
    const cursor = input ? input.selectionStart : replyText.length
    const nextText = `${replyText.slice(0, cursor)}${emoji}${replyText.slice(cursor)}`
    setReplyText(nextText)
    setEmojiPickerOpen(false)

    requestAnimationFrame(() => {
      input?.focus()
      const nextPosition = cursor + emoji.length
      input?.setSelectionRange(nextPosition, nextPosition)
    })
  }

  return (
    <div className="app-shell chat-page-shell flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="chat-header z-10 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur sm:gap-3 sm:px-6">
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
          <CustomerAvatar
            src={conv.profile_pic_url}
            initials={initials}
            className="chat-profile-avatar h-9 w-9 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="theme-text truncate text-sm font-semibold sm:text-base">{headline}</h1>
              <button
                type="button"
                onClick={() => {
                  setRenameInput(conv.custom_name || conv.name || '')
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
            aria-label={`${botActive ? 'Disable' : 'Enable'} bot for ${headline}`}
            aria-pressed={botActive}
            className={`chat-bot-toggle flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:text-sm ${botActive ? 'is-active' : 'is-inactive'}`}
          >
            <span className={`h-2 w-2 rounded-full ${botActive ? 'bg-[#36e5ad]' : 'bg-[#ba8cff]'}`} />
            <span className="hidden sm:inline">{toggling ? 'Updating...' : botActive ? 'Disable' : 'Enable'}</span>
            <span className="sm:hidden">{toggling ? '...' : botActive ? 'Disable' : 'Enable'}</span>
          </button>
          <button
            type="button"
            onClick={handleClearHistory}
            disabled={clearingHistory}
            className="chat-bot-toggle rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            {clearingHistory ? 'Clearing…' : 'Clear chat'}
          </button>
        </div>
      </header>

      {/* Rename Modal */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-(--line) bg-(--surface) p-5 shadow-2xl">
            <h2 className="text-sm font-bold text-(--foreground) mb-1">Edit Display Name</h2>
            <p className="text-xs theme-muted mb-4">Set a custom contact name. This will never be overwritten by WhatsApp syncs.</p>
            <form onSubmit={handleSaveRename} className="flex flex-col gap-3">
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Enter custom contact name..."
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

      {requestError && (
        <p role="alert" className="chat-error z-10 border-b px-4 py-2 text-center text-sm">
          {requestError}
        </p>
      )}
      {loadError && messages.length > 0 && (
        <p role="status" className="chat-error z-10 border-b px-4 py-2 text-center text-sm">
          Earlier messages could not be loaded yet. Retrying…{' '}
          <button type="button" onClick={retryHistory} className="underline">Retry now</button>
        </p>
      )}
      <p className="theme-muted border-b px-4 py-1.5 text-center text-[11px]">
        Clearing removes this chat history (and its media files) from the dashboard; it does not delete messages from WhatsApp.
      </p>

      <main className="chat-thread min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
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
          ) : messages.map((msg, index) => {
            const isIncoming = msg.sender === 'customer'

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
                      {isIncoming ? headline : msg.sender === 'human' ? 'You' : 'Synthra AI'}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <time className="chat-time shrink-0 text-[11px]" dateTime={msg.created_at}>
                        {formatMessageTime(msg.created_at)}
                      </time>
                      {msg.id && (
                        <button
                          type="button"
                          title="Delete message"
                          aria-label="Delete message"
                          onClick={() => handleDeleteMessage(msg.id)}
                          disabled={deletingId === msg.id}
                          className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-400 transition cursor-pointer p-0.5"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Media attachment rendering */}
                  {msg.media_url && (
                    <MediaMessage message={msg} incoming={isIncoming} />
                  )}

                  {msg.text && (
                    <p className="wrap-break-word whitespace-pre-wrap text-sm leading-6 sm:text-[15px]">{msg.text}</p>
                  )}
                </div>
              </article>
            )
          })}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
      </main>

      <footer className="chat-composer shrink-0 px-3 py-3 sm:px-6 sm:py-4">
        {attachment && (
          <div className="mx-auto mb-2 flex w-full max-w-4xl items-center gap-3 rounded-xl border border-(--line) p-2">
            {attachmentPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachmentPreview} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-lg text-xl">📄</span>
            )}
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate font-semibold">{attachment.name}</p>
              <p className="theme-muted">{formatFileSize(attachment.size)} · any text below is sent as the caption</p>
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              disabled={sending}
              aria-label="Remove attachment"
              className="px-2 text-sm opacity-70 hover:opacity-100 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        )}
        <form
          className="mx-auto flex w-full max-w-4xl items-end gap-2 sm:gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            handleSend()
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACH_ACCEPT}
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            title="Attach file"
            aria-label="Attach file"
            disabled={sending}
            onClick={() => fileInputRef.current?.click()}
            className="emoji-button flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition disabled:opacity-50"
          >
            📎
          </button>
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
                    onClick={() => handleEmojiSelect(emoji)}
                    className="emoji-choice flex aspect-square items-center justify-center rounded-lg text-xl transition"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="sr-only" htmlFor="dashboard-reply-input">
            Write a WhatsApp reply
          </label>
          <textarea
            ref={replyInputRef}
            id="dashboard-reply-input"
            rows={1}
            maxLength={1000}
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder="Type a message..."
            className="chat-input max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-xl px-4 py-3 text-sm outline-none transition"
          />

          <button
            type="submit"
            disabled={sending || (!replyText.trim() && !attachment)}
            className="chat-send-button h-11 shrink-0 rounded-xl px-4 text-sm font-bold shadow-[0_5px_20px_rgba(17,189,217,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed sm:px-6"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  )
}
