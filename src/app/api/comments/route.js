import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../lib/facebook-dashboard.js'
import { attachCommentAuthors } from '../../../../lib/comment-authors.js'
import { attachCommentReplies } from '../../../../lib/comment-replies.js'

export const dynamic = 'force-dynamic'

const LIMIT = 100

const PRIVATE_REPLY_ACTIONS = [
  'private_reply_sent', 'private_reply_sent_public_notice', 'private_reply_sent_notice_failed',
  'private_reply_sent_manual', 'private_reply_sent_manual_public_notice', 'private_reply_sent_manual_notice_failed',
]

const HIDDEN_ACTIONS = {
  facebook: ['deleted_by_admin', 'deleted_from_facebook'],
  instagram: ['deleted_by_admin', 'deleted_from_instagram'],
}

// GET /api/comments?platform=facebook|instagram
// JSON version of what the Facebook / Instagram comments pages load on the server, so the
// mobile app gets the same enriched list (authors, previous replies, private-reply status).
export async function GET(request) {
  const platform = new URL(request.url).searchParams.get('platform')?.trim() || 'facebook'
  if (!['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ success: false, error: 'Invalid platform' }, { status: 400 })
  }

  const supabase = getFacebookSupabase()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Social inbox database is not configured' }, { status: 503 })
  }

  try {
    const settings = await getGlobalBotSettings()
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    if (error) {
      return NextResponse.json({ success: false, error: error.message || 'Could not load comments' }, { status: 500 })
    }

    const { data: privateReplyLogs } = await supabase
      .from('activity_logs')
      .select('detail')
      .eq('event', 'comment_manual_private_reply')
      .order('created_at', { ascending: false })
      .limit(1000)
    const privateReplyCommentIds = new Set(
      (privateReplyLogs || []).map((entry) => entry.detail?.comment_id).filter(Boolean)
    )

    const visible = (data || [])
      .filter((comment) => !HIDDEN_ACTIONS[platform].includes(comment.action))
      .map((comment) => ({
        ...comment,
        platform,
        private_reply_sent:
          privateReplyCommentIds.has(comment.comment_id) || PRIVATE_REPLY_ACTIONS.includes(comment.action),
      }))

    const authored = await attachCommentAuthors(supabase, visible, platform)
    const comments = await attachCommentReplies(supabase, authored)

    return NextResponse.json(
      {
        success: true,
        comments,
        bot_active: Boolean(
          platform === 'instagram'
            ? settings?.settings?.instagram_comment_bot_active
            : settings?.settings?.comment_bot_active
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load comments' }, { status: 500 })
  }
}
