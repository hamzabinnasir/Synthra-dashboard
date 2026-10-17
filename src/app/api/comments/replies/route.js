import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { loadCommentReplies } from '../../../../../lib/comment-replies.js'

export const dynamic = 'force-dynamic'

// GET /api/comments/replies?ids=<comment_id>,<comment_id>
// Returns { replies: { [comment_id]: Reply[] } } so the comments list can refresh
// the "previous replies" of a comment after the bot or an agent replies to it.
export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('ids') || ''
  const ids = [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))]
  if (!ids.length || ids.length > 50 || ids.some((id) => id.length > 120)) {
    return NextResponse.json({ success: false, error: 'Provide between 1 and 50 comment IDs' }, { status: 400 })
  }

  const supabase = getFacebookSupabase()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Social inbox database is not configured' }, { status: 503 })
  }

  try {
    const replies = await loadCommentReplies(supabase, ids)
    return NextResponse.json(
      { success: true, replies: Object.fromEntries(ids.map((id) => [id, replies.get(id) || []])) },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load comment replies' }, { status: 500 })
  }
}
