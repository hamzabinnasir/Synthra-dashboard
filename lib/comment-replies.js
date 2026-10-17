/**
 * Loads the replies that were already sent for a set of comments so the dashboard
 * can show them under each comment.
 *
 * Sources (all optional - a missing table/column just means fewer replies):
 *  - messages (comment_id set)          -> PRIVATE replies sent to the commenter's inbox
 *                                          (sender "bot" = Synthra AI, "human" = dashboard user)
 *  - activity_logs comment_manual_public_reply   -> PUBLIC replies typed in the dashboard
 *  - activity_logs comment_bot_public_reply      -> PUBLIC replies posted by the bot
 *  - activity_logs comment_manual_private_reply  -> PRIVATE replies typed in the dashboard
 *                                          (fallback when the commenter has no message row)
 *
 * Each reply: { id, kind: 'public' | 'private', by: 'bot' | 'human', text, created_at }
 */

const REPLY_EVENTS = ['comment_manual_public_reply', 'comment_bot_public_reply', 'comment_manual_private_reply']
const CHUNK_SIZE = 50
const MAX_IDS = 200

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function loadCommentReplies(supabase, commentIds) {
  const ids = [...new Set((commentIds || []).filter((id) => typeof id === 'string' && id))].slice(0, MAX_IDS)
  const byComment = new Map()
  if (!supabase || !ids.length) return byComment

  const push = (commentId, reply) => {
    if (!commentId || !reply.text) return
    const list = byComment.get(commentId) || []
    list.push(reply)
    byComment.set(commentId, list)
  }

  for (const batch of chunk(ids, CHUNK_SIZE)) {
    const [messagesResult, logsResult] = await Promise.all([
      supabase
        .from('messages')
        .select('id,sender,text,created_at,comment_id')
        .in('comment_id', batch)
        .in('sender', ['bot', 'human'])
        .order('created_at', { ascending: true }),
      supabase
        .from('activity_logs')
        .select('id,event,detail,created_at')
        .in('event', REPLY_EVENTS)
        .in('detail->>comment_id', batch)
        .order('created_at', { ascending: true }),
    ])

    if (!messagesResult.error) {
      for (const row of messagesResult.data || []) {
        push(row.comment_id, {
          id: `m-${row.id}`,
          kind: 'private',
          by: row.sender === 'human' ? 'human' : 'bot',
          text: cleanText(row.text),
          created_at: row.created_at,
        })
      }
    }

    if (!logsResult.error) {
      for (const row of logsResult.data || []) {
        const detail = row.detail || {}
        const text = cleanText(detail.message)
        if (!text) continue
        const isPrivate = row.event === 'comment_manual_private_reply'
        push(detail.comment_id, {
          id: `l-${row.id}`,
          kind: isPrivate ? 'private' : 'public',
          by: row.event === 'comment_bot_public_reply' ? 'bot' : 'human',
          text,
          created_at: row.created_at,
        })
      }
    }
  }

  // A manual private reply is stored twice (message row + activity log); keep one copy.
  for (const [commentId, list] of byComment) {
    const seen = new Set()
    const unique = []
    for (const reply of list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
      const key = `${reply.kind}|${reply.text}`
      if (reply.kind === 'private' && seen.has(key)) continue
      seen.add(key)
      unique.push(reply)
    }
    byComment.set(commentId, unique)
  }

  return byComment
}

/** Adds a `replies` array (oldest first) to every comment. */
export async function attachCommentReplies(supabase, comments) {
  if (!comments?.length) return comments || []
  let replies
  try {
    replies = await loadCommentReplies(supabase, comments.map((comment) => comment.comment_id))
  } catch {
    replies = new Map()
  }
  return comments.map((comment) => ({ ...comment, replies: replies.get(comment.comment_id) || [] }))
}
