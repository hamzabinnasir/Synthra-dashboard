import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../lib/facebook-dashboard.js'
import { attachCommentAuthors } from '../../../../lib/comment-authors.js'
import { attachCommentReplies } from '../../../../lib/comment-replies.js'
import { DashboardHeader, FacebookCommentsList } from '../../DashboardChrome'

export const dynamic = 'force-dynamic'

export default async function InstagramCommentsPage() {
  const supabase = getFacebookSupabase()
  const settings = await getGlobalBotSettings()
  const { data, error } = supabase
    ? await supabase.from('comments').select('*').eq('platform', 'instagram').order('created_at', { ascending: false }).limit(100)
    : { data: null, error: true }
  const { data: privateReplyLogs } = !error && supabase
    ? await supabase.from('activity_logs').select('detail').eq('event', 'comment_manual_private_reply').order('created_at', { ascending: false }).limit(1000)
    : { data: [] }
  const privateReplyCommentIds = new Set((privateReplyLogs || []).map((entry) => entry.detail?.comment_id).filter(Boolean))
  const visibleComments = (data || [])
    .filter((comment) => !['deleted_by_admin', 'deleted_from_instagram'].includes(comment.action))
    .map((comment) => ({
      ...comment,
      private_reply_sent: privateReplyCommentIds.has(comment.comment_id) || [
        'private_reply_sent', 'private_reply_sent_public_notice', 'private_reply_sent_notice_failed',
        'private_reply_sent_manual', 'private_reply_sent_manual_public_notice', 'private_reply_sent_manual_notice_failed',
      ].includes(comment.action),
    }))
  const authoredComments = error ? [] : await attachCommentAuthors(supabase, visibleComments, 'instagram')
  const comments = error ? [] : await attachCommentReplies(supabase, authoredComments)

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <DashboardHeader activeSection="instagram-comments" initialSettings={settings} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <h1 className="theme-text text-2xl font-semibold">Instagram Comments</h1>
          <p className="theme-muted mt-1 text-sm">Comment outcomes and reply controls</p>
        </div>
        {error ? (
          <p role="alert" className="chat-error rounded-xl border p-4 text-sm">
            {!supabase
              ? 'Social inbox Supabase is not configured. Add its server-only URL and service key to the dashboard environment.'
              : error.code === '42703'
                ? 'Instagram support is not enabled in the database yet. Run supabase/migrations/20261004_instagram_support.sql in the Supabase SQL Editor, then reload this page.'
                : `Could not load Instagram comments: ${error.message || 'unknown database error'}`}
          </p>
        ) : (
          <FacebookCommentsList comments={comments} globalBotActive={settings.settings.instagram_comment_bot_active} platform="instagram" />
        )}
      </main>
    </div>
  )
}
