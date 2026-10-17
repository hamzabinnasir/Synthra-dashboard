import { supabase } from '../../../../../lib/supabase.js'

const encoder = new TextEncoder()

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
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

      // Immediately flush connected comment & ready event so browser EventSource transitions to live instantly
      try {
        controller.enqueue(encoder.encode(': connected\n\n'))
        send('ready', {})
      } catch {
        close()
        return
      }

function matchesPlatform(item, target) {
  if (!target) return true
  const itemPlatform = item?.platform
  const psid = String(item?.psid || '')

  if (target === 'whatsapp') {
    return itemPlatform === 'whatsapp' || psid.startsWith('wa_')
  }
  if (target === 'instagram') {
    return itemPlatform === 'instagram' || psid.startsWith('ig_')
  }
  if (target === 'facebook') {
    return itemPlatform === 'facebook' || (!itemPlatform && !psid.startsWith('wa_') && !psid.startsWith('ig_'))
  }
  return itemPlatform === target
}

function resolvePlatform(item) {
  if (item?.platform) return item.platform
  const psid = String(item?.psid || '')
  if (psid.startsWith('wa_')) return 'whatsapp'
  if (psid.startsWith('ig_')) return 'instagram'
  return 'facebook'
}

      const channelName = `inbox-${targetPlatform || 'all'}-${globalThis.crypto.randomUUID()}`

      channel = supabase
        .channel(channelName, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          (payload) => {
            const row = payload.new || payload.old || {}
            if (!matchesPlatform(row, targetPlatform)) {
              return
            }
            if (payload.eventType === 'INSERT') {
              send('customer-inserted', { ...payload.new, platform: resolvePlatform(payload.new) })
            } else if (payload.eventType === 'UPDATE') {
              send('customer-updated', { ...payload.new, platform: resolvePlatform(payload.new) })
            } else if (payload.eventType === 'DELETE') {
              send('customer-deleted', { psid: payload.old?.psid })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new
            if (!msg || !matchesPlatform(msg, targetPlatform)) return
            send('new-message-activity', {
              id: msg.id,
              psid: msg.psid,
              platform: resolvePlatform(msg),
              sender: msg.sender,
              text: msg.text,
              created_at: msg.created_at,
            })
          }
        )

      const broadcastChannel = supabase
        .channel('inbox-broadcast')
        .on('broadcast', { event: 'all-conversations-deleted' }, (event) => {
          const payload = event.payload || {}
          if (!targetPlatform || !payload.platform || payload.platform === targetPlatform) {
            send('all-conversations-deleted', payload)
          }
        })
        .on('broadcast', { event: 'customer-deleted' }, (event) => {
          const payload = event.payload || {}
          if (!targetPlatform || !payload.platform || payload.platform === targetPlatform) {
            if (payload.psid) {
              send('customer-deleted', { psid: payload.psid })
            }
          }
        })

      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'))
          } catch {
            close()
          }
        }
      }, 15000)

      dispose = () => {
        close()
        if (broadcastChannel) void supabase.removeChannel(broadcastChannel)
      }
      request.signal.addEventListener('abort', dispose, { once: true })
      if (request.signal.aborted) dispose()

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          send('ready', {})
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          send('realtime-error', {})
        }
      })
      broadcastChannel.subscribe()
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
