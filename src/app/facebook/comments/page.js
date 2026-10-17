import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../lib/facebook-dashboard.js'
import { attachCommentAuthors } from '../../../../lib/comment-authors.js'
import { attachCommentReplies } from '../../../../lib/comment-replies.js'
import { DashboardHeader, FacebookCommentsList } from '../../DashboardChrome'

export const dynamic = 'force-dynamic'

export default async function FacebookCommentsPage() {
  const facebookSupabase = getFacebookSupabase()
  const settings = await getGlobalBotSettings()
  const { data, error } = facebookSupabase
    ? await facebookSupabase.from('comments').select('*').eq('platform', 'facebook').order('created_at', { ascending: false }).limit(100)
    : { data: null, error: true }
  const { data: privateReplyLogs } = !error && facebookSupabase
    ? await facebookSupabase.from('activity_logs').select('detail').eq('event', 'comment_manual_private_reply').order('created_at', { ascending: false }).limit(1000)
    : { data: [] }
  const privateReplyCommentIds = new Set((privateReplyLogs || []).map((entry) => entry.detail?.comment_id).filter(Boolean))
  const visibleComments = (data || []).filter((comment) => !['deleted_by_admin', 'deleted_from_facebook'].includes(comment.action)).map((comment) => ({
    ...comment,
    platform: 'facebook',
    private_reply_sent: privateReplyCommentIds.has(comment.comment_id) || [
      'private_reply_sent', 'private_reply_sent_public_notice', 'private_reply_sent_notice_failed',
      'private_reply_sent_manual', 'private_reply_sent_manual_public_notice', 'private_reply_sent_manual_notice_failed',
    ].includes(comment.action),
  }))
  const authoredComments = error ? [] : await attachCommentAuthors(facebookSupabase, visibleComments, 'facebook')
  const comments = error ? [] : await attachCommentReplies(facebookSupabase, authoredComments)

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <DashboardHeader activeSection="facebook-comments" initialSettings={settings} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <h1 className="theme-text text-2xl font-semibold">Facebook Comments</h1>
          <p className="theme-muted mt-1 text-sm">Comment outcomes and reply controls</p>
        </div>
        {error ? (
          <p role="alert" className="chat-error rounded-xl border p-4 text-sm">
            {!facebookSupabase
              ? 'Facebook Supabase is not configured. Add its server-only URL and service key to the dashboard environment.'
              : `Could not load Facebook comments: ${error.message || 'unknown database error'}`}
          </p>
        ) : (
          <FacebookCommentsList comments={comments} globalBotActive={settings.settings.comment_bot_active} platform="facebook" />
        )}
      </main>
    </div>
  )
}
