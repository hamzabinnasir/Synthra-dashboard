import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { supabase as defaultSupabase } from '../../../../../lib/supabase.js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const platform = body?.platform?.trim() || ''

  if (!['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json(
      { success: false, error: 'Valid platform is required (facebook or instagram)' },
      { status: 400 }
    )
  }

  const supabase = getFacebookSupabase() || defaultSupabase
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'Social inbox database is not configured' },
      { status: 503 }
    )
  }

  try {
    // 1. Fetch matching comment records for this platform
    const { data: comments, error: fetchErr } = await supabase
      .from('comments')
      .select('comment_id,platform,post_id')
      .eq('platform', platform)

    if (fetchErr) {
      console.warn('[delete-all-comments] comments fetch warning:', fetchErr.message)
    }

    const count = (comments || []).length

    // 2. Prevent future re-insertion by recording deleted comment IDs
    if (comments && comments.length > 0) {
      try {
        const deleteRows = comments.map((c) => ({
          platform,
          comment_id: c.comment_id,
        }))
        await supabase
          .from('deleted_comment_ids')
          .upsert(deleteRows, { onConflict: 'platform,comment_id' })
      } catch (upsertErr) {
        console.warn('[delete-all-comments] deleted_comment_ids warning:', upsertErr.message)
      }
    }

    // 3. Delete matching comment messages from messages table if any
    try {
      await supabase
        .from('messages')
        .delete()
        .eq('platform', platform)
        .not('comment_id', 'is', null)
    } catch (msgErr) {
      console.warn('[delete-all-comments] messages delete warning:', msgErr.message)
    }

    // 4. Delete all matching comments from comments table
    const { error: deleteErr } = await supabase
      .from('comments')
      .delete()
      .eq('platform', platform)

    if (deleteErr) {
      return NextResponse.json(
        { success: false, error: deleteErr.message },
        { status: 500 }
      )
    }

    // 5. Audit log
    try {
      await supabase.from('activity_logs').insert({
        event: 'all_comments_deleted_by_admin',
        detail: {
          platform,
          record_count: count,
        },
      })
    } catch {}

    // 6. Broadcast global deletion event so all connected dashboards update instantly
    try {
      const channel = supabase.channel('comments-broadcast')
      await channel.send({
        type: 'broadcast',
        event: 'all-comments-deleted',
        payload: { platform },
      })
      void supabase.removeChannel(channel)
    } catch (bcErr) {
      console.warn('[delete-all-comments] broadcast warning:', bcErr)
    }

    return NextResponse.json({
      success: true,
      count,
      platform,
      message: `All ${platform} comments have been deleted from the database.`,
    })
  } catch (err) {
    console.error('[delete-all-comments] unexpected error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Could not delete comments' },
      { status: 500 }
    )
  }
}
