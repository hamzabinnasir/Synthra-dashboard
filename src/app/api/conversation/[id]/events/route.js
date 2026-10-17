import { supabase } from '../../../../../../lib/supabase.js'

const encoder = new TextEncoder()

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const { id } = await params
  const decodedId = decodeURIComponent(id)
  const isWhatsApp = /^wa_\d{5,20}$/.test(decodedId)
  const isFacebook = /^\d{5,20}$/.test(decodedId)
  const isInstagram = /^ig_\d+$/.test(decodedId)

  if (!isWhatsApp && !isFacebook && !isInstagram) {
    return Response.json({ error: 'Invalid conversation ID' }, { status: 400 })
  }

  let dispose = () => {}
  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      let heartbeat
      let channel

      // `customers.history_cleared_at` stays set forever once a chat has been cleared, and every
      // later customers UPDATE (new message -> last_message_text, unread counter, mark-read, bot
      // toggle...) carries it again. Only a CHANGE of that value is a real "history cleared", so
      // remember the value this stream started with (Infinity = unknown -> never fire; real clears
      // still reach the page through the per-row message DELETE events).
      let knownClearedMs = Infinity
      const clearedSeed = Promise.resolve(
        supabase.from('customers').select('history_cleared_at').eq('psid', decodedId).maybeSingle()
      )
        .then(({ data, error }) => {
          if (error) return
          const parsed = data?.history_cleared_at ? Date.parse(data.history_cleared_at) : 0
          knownClearedMs = Number.isNaN(parsed) ? 0 : parsed
        })
        .catch(() => {})

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        request.signal.removeEventListener('abort', close)
        try {
          controller.close()
        } catch {}
        if (channel) void supabase.removeChannel(channel)
      }

      const send = (eventName, payload) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`))
        } catch {
          close()
        }
      }

      channel = supabase
        .channel(`conversation-${decodedId}-${globalThis.crypto.randomUUID()}`, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `psid=eq.${decodedId}` },
          (payload) => {
            send('new-message', payload.new)
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `psid=eq.${decodedId}` },
          (payload) => {
            send('message-updated', payload.new)
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.old?.id) {
              send('message-deleted', { id: payload.old.id })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'customers', filter: `psid=eq.${decodedId}` },
          (payload) => {
            const clearedAt = payload.new?.history_cleared_at
            if (!clearedAt) return
            void clearedSeed.then(() => {
              const clearedMs = Date.parse(clearedAt)
              if (Number.isNaN(clearedMs) || clearedMs <= knownClearedMs) return
              knownClearedMs = clearedMs
              send('history-cleared', { cleared_at: clearedAt })
            })
          }
        )

      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'))
          } catch {
            close()
          }
        }
      }, 20000)

      dispose = close
      request.signal.addEventListener('abort', close, { once: true })
      if (request.signal.aborted) close()

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') send('ready', {})
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          send('realtime-error', {})
          close()
        }
      })
    },
    cancel() {
      dispose()
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  })
}
