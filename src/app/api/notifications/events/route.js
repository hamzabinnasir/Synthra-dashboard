import { cookies } from 'next/headers'
import { supabase } from '../../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../../lib/auth.js'

const encoder = new TextEncoder()

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const admin = await getCurrentAdmin(await cookies())
  if (!admin) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const targetPlatform = searchParams.get('platform')?.trim() || ''

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

      try {
        controller.enqueue(encoder.encode(': connected\n\n'))
        send('ready', {})
      } catch {
        close()
        return
      }

      const channelName = `notifications-${targetPlatform || 'all'}-${globalThis.crypto.randomUUID()}`

      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          (payload) => {
            const row = payload.new || payload.old || {}
            if (targetPlatform && targetPlatform !== 'all' && row.platform !== targetPlatform) {
              return
            }
            if (payload.eventType === 'INSERT') {
              send('new-notification', payload.new)
            } else if (payload.eventType === 'UPDATE') {
              send('notification-updated', payload.new)
            } else if (payload.eventType === 'DELETE') {
              send('notification-deleted', { id: payload.old?.id })
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            send('ready', { channel: channelName })
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            send('realtime-error', { status })
          }
        })

      heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          close()
        }
      }, 20000)

      request.signal.addEventListener('abort', close)
      dispose = close
    },
    cancel() {
      dispose()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
