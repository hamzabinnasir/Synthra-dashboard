import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import {
  facebookGraphRequest,
  getFacebookGraphConfig,
  getInstagramGraphConfig,
  instagramGraphRequest,
} from '../../../../../lib/facebook-graph.js'

async function resolveFacebookCommentId(comment) {
  if (!comment.post_id) return comment.comment_id

  const matches = []
  let after
  for (let page = 0; page < 20; page += 1) {
    try {
      const result = await facebookGraphRequest(`${encodeURIComponent(comment.post_id)}/comments`, {
        query: {
          fields: 'id,message',
          limit: '100',
          ...(after ? { after } : {}),
        },
      })

      for (const candidate of result.data || []) {
        if (candidate.id === comment.comment_id) return candidate.id
        if (typeof comment.message === 'string' && candidate.message === comment.message) {
          matches.push(candidate.id)
        }
      }

      after = result.paging?.cursors?.after
      if (!after) break
    } catch {
      // If fetching post comments fails (e.g. post was deleted or inaccessible), fallback to null
      return null
    }
  }

  const uniqueMatches = [...new Set(matches.filter((id) => typeof id === 'string' && id))]
  if (uniqueMatches.length === 1) return uniqueMatches[0]
  return null
}

function isNotFoundOnPlatform(error) {
  if (!error) return true
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('object with id') ||
    message.includes('cannot be loaded') ||
    message.includes('code 100') ||
    message.includes('code 33') ||
    message.includes('subcode 33') ||
    message.includes('unsupported delete request') ||
    message.includes('unsupported get request') ||
    message.includes('invalid parameter') ||
    message.includes('unknown path components') ||
    message.includes('could not find this comment') ||
    message.includes('404')
  )
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const commentId = typeof body?.commentId === 'string' ? body.commentId.trim() : ''
  if (!commentId) return NextResponse.json({ success: false, error: 'Invalid comment ID' }, { status: 400 })

  const supabase = getFacebookSupabase()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Social inbox database is not configured' }, { status: 503 })
  }

  let platform = commentId.startsWith('ig_') ? 'instagram' : 'facebook'
  let platformDeleted = false
  let platformNotFound = false

  try {
    const { data: comment } = await supabase
      .from('comments')
      .select('comment_id,platform,post_id,message')
      .eq('comment_id', commentId)
      .maybeSingle()

    if (comment?.platform) {
      platform = comment.platform
    }

    const externalCommentId = platform === 'instagram' && commentId.startsWith('ig_') ? commentId.slice(3) : commentId

    // Try deleting from Instagram / Facebook Graph API if configured
    if (platform === 'instagram') {
      if (getInstagramGraphConfig()) {
        try {
          await instagramGraphRequest(encodeURIComponent(externalCommentId), { method: 'DELETE' })
          platformDeleted = true
        } catch (metaError) {
          platformNotFound = true
          console.warn('[comment-delete] Instagram Graph API notice (continuing DB delete):', metaError.message)
        }
      } else {
        platformNotFound = true
      }
    } else {
      if (getFacebookGraphConfig()) {
        try {
          let verifiedCommentId = null
          if (comment) {
            verifiedCommentId = await resolveFacebookCommentId({
              ...comment,
              comment_id: externalCommentId,
            })
          }
          const targetCommentId = verifiedCommentId || externalCommentId
          await facebookGraphRequest(encodeURIComponent(targetCommentId), { method: 'DELETE' })
          platformDeleted = true
        } catch (metaError) {
          platformNotFound = true
          console.warn('[comment-delete] Facebook Graph API notice (continuing DB delete):', metaError.message)
        }
      } else {
        platformNotFound = true
      }
    }

    // Always delete the comment from Supabase database
    try {
      await supabase.rpc('delete_comment_records', {
        p_comment_id: commentId,
        p_platform: platform,
        p_actor_id: 'dashboard',
        p_action_type: platformNotFound ? 'comment_deleted_db_only' : 'comment_deleted_by_admin',
      })
    } catch (rpcError) {
      console.warn('[comment-delete] RPC delete_comment_records notice:', rpcError.message)
    }

    // Direct delete from comments table to guarantee it is removed
    await supabase.from('comments').delete().eq('comment_id', commentId)

    // Activity log entry
    try {
      await supabase.from('activity_logs').insert({
        event: 'comment_deleted_by_admin',
        detail: {
          comment_id: commentId,
          platform,
          platform_deleted: platformDeleted,
          platform_not_found: platformNotFound,
        },
      })
    } catch {}

    const channel = platform === 'instagram' ? 'Instagram' : 'Facebook'
    const message = platformNotFound && !platformDeleted
      ? `Comment was not found on ${channel} (it may have already been removed) and has been deleted from the database.`
      : `Comment deleted from ${channel} and removed from database.`

    return NextResponse.json({
      success: true,
      platformDeleted,
      platformNotFound,
      message,
    })
  } catch (error) {
    console.error('[comment-delete] Unexpected error during comment deletion:', error)
    // Even if an unexpected error occurred, try to delete from Supabase so the user is never stuck
    try {
      await supabase.from('comments').delete().eq('comment_id', commentId)
      return NextResponse.json({
        success: true,
        message: 'Comment removed from database.',
      })
    } catch (dbErr) {
      return NextResponse.json({
        success: false,
        error: `Could not delete comment from database: ${dbErr.message || error.message}`,
      }, { status: 500 })
    }
  }
}