import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase.js'
import { destroyMediaAssets, fetchMediaRows } from '../../../../lib/cloudinary.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

  try {
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
