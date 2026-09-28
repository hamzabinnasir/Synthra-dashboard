import { supabase } from '../../../../../../lib/supabase.js'

const encoder = new TextEncoder()

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const { id } = await params
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return Response.json({ error: 'Invalid conversation ID' }, { status: 400 })
  }

  let dispose = () => {}
  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      let heartbeat
      let channel

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
        .channel(`conversation-${id}-${globalThis.crypto.randomUUID()}`, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
          (payload) => send('new-message', payload.new)
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