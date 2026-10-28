import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase.js'
import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'
import { destroyMediaAssets, fetchMediaRows } from '../../../../lib/cloudinary.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Facebook/Instagram messages live in their own Supabase project only when FACEBOOK_SUPABASE_URL differs
// from the default project. Message ids are only unique per project, so in that case the delete must go to
// the right project AND be scoped by psid, otherwise it could remove an unrelated row with the same id.
function separateFacebookDb(platform) {
  if (platform !== 'facebook' && platform !== 'instagram') return null
  const client = getFacebookSupabase()
  if (!client) return null
  const sameProject = process.env.FACEBOOK_SUPABASE_URL === process.env.NEXT_PUBLIC_SUPABASE_URL
  return sameProject ? null : client
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const messageId = body?.messageId
  const parsedId = Number(messageId)
  if (!messageId || !Number.isInteger(parsedId) || parsedId <= 0) {
    return NextResponse.json({ success: false, error: 'Invalid message ID' }, { status: 400 })
  }

  const platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : ''
  const psid = typeof body?.psid === 'string' ? body.psid.trim() : ''
  const facebookDb = separateFacebookDb(platform)

  try {
    if (facebookDb) {
      if (!psid) {
        return NextResponse.json({ success: false, error: 'psid is required for this channel' }, { status: 400 })
      }
      const mediaRows = (await fetchMediaRows(facebookDb, 'id', [parsedId])).filter((row) => row)
      const { data: removed, error } = await facebookDb
        .from('messages')
        .delete()
        .eq('id', parsedId)
        .eq('psid', psid)
        .select('id')
      if (error) {
        console.error('[delete-message] facebook delete error:', error)
        return NextResponse.json({ success: false, error: error.message || 'Could not delete message' }, { status: 500 })
      }
      const count = removed?.length || 0
      if (count === 0) {
        return NextResponse.json({ success: true, deleted_count: 0, message: 'Message was not found or already deleted' })
      }
      const media = await destroyMediaAssets(mediaRows)
      return NextResponse.json({ success: true, deleted_count: count, media })
    }

    // Read the media reference first: once the row is gone we can no longer find the file.
    const mediaRows = await fetchMediaRows(supabase, 'id', [parsedId])

    const { data, error } = await supabase.rpc('delete_single_message', {
      p_message_id: parsedId,
      p_actor_id: 'dashboard-user',
    })

    if (error) {
      console.error('[delete-message] RPC error:', error)
      return NextResponse.json({ success: false, error: error.message || 'Could not delete message' }, { status: 500 })
    }

    if (data === 0) {
      // Message either already deleted or not found
      return NextResponse.json({ success: true, deleted_count: 0, message: 'Message was not found or already deleted' })
    }

    // Row is deleted from Supabase; now remove the file from Cloudinary.
    const media = await destroyMediaAssets(mediaRows)

    return NextResponse.json({ success: true, deleted_count: data, media })
  } catch (err) {
    console.error('[delete-message] Exception:', err)
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 })
  }
}
