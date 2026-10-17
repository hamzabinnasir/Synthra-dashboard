import { supabase } from '../../../../../lib/supabase.js'
import { loadCommentAuthors, withAuthor } from '../../../../../lib/comment-authors.js'

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

      // Attach the commenter's profile picture / display info before the comment
      // reaches the browser. The backend saves the customer row slightly after the
      // comment row, so a miss here is fixed later by the `author-updated` event below.
      const sendWithAuthor = async (eventName, comment) => {
        let enriched = comment
        try {
          if (comment?.from_id) {
            const authors = await loadCommentAuthors(supabase, [comment.from_id])
            enriched = withAuthor(comment, authors.get(comment.from_id))
          }
        } catch {
          enriched = comment
        }
        send(eventName, enriched)
      }

      // Immediately flush connected comment & ready event
      try {
        controller.enqueue(encoder.encode(': connected\n\n'))
        send('ready', {})
      } catch {
        close()
        return
      }

      const channelName = `comments-${targetPlatform || 'all'}-${globalThis.crypto.randomUUID()}`

      // Create filter if platform specified
      const filterConfig = targetPlatform
        ? { event: '*', schema: 'public', table: 'comments', filter: `platform=eq.${targetPlatform}` }
        : { event: '*', schema: 'public', table: 'comments' }

      channel = supabase
        .channel(channelName, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on(
          'postgres_changes',
          filterConfig,
          (payload) => {
            if (payload.eventType === 'INSERT') {
              void sendWithAuthor('new-comment', payload.new)
            } else if (payload.eventType === 'UPDATE') {
              void sendWithAuthor('comment-updated', payload.new)
            }
          }
        )
        // Also subscribe to DELETE events on comments table (which send { comment_id } in payload.old)
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'comments' },
          (payload) => {
            if (payload.old?.comment_id) {
              send('comment-deleted', { comment_id: payload.old.comment_id })
            }
          }
        )
        // Commenter profile saved or changed (new photo, renamed in the dashboard, ...)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          (payload) => {
            const row = payload.new
            if (!row?.psid) return
            if (targetPlatform && row.platform && row.platform !== targetPlatform) return
            send('author-updated', {
              psid: row.psid,
              name: row.name || null,
              custom_name: row.custom_name || null,
              username: row.username || null,
              profile_pic_url: row.profile_pic_url || null,
            })
          }
        )

      const broadcastChannel = supabase
        .channel('comments-broadcast')
        .on('broadcast', { event: 'all-comments-deleted' }, (event) => {
          const payload = event.payload || {}
          if (!targetPlatform || !payload.platform || payload.platform === targetPlatform) {
            send('all-comments-deleted', payload)
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
      }, 20000)

      dispose = () => {
        close()
        if (broadcastChannel) void supabase.removeChannel(broadcastChannel)
      }
      request.signal.addEventListener('abort', dispose, { once: true })
      if (request.signal.aborted) dispose()

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          send('ready', {})
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
