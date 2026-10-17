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

  const psid = body?.psid?.trim()
  const platform = body?.platform?.trim() || ''

  if (!psid) {
    return NextResponse.json({ success: false, error: 'PSID is required' }, { status: 400 })
  }

  try {
    // 0. Remember which Cloudinary files belong to this conversation before the rows vanish
    const mediaRows = await fetchMediaRows(supabase, 'psid', [psid])

    // 1. Delete all messages for this contact
    const { error: msgError } = await supabase
      .from('messages')
      .delete()
      .eq('psid', psid)

    if (msgError) {
      console.warn('[delete-conversation] messages delete warning:', msgError.message)
    }

    // 2. Delete customer record
    const { error: custError } = await supabase
      .from('customers')
      .delete()
      .eq('psid', psid)

    if (custError) {
      return NextResponse.json({ success: false, error: custError.message }, { status: 500 })
    }

    // 3. Database rows are gone: remove the media from Cloudinary
    const media = await destroyMediaAssets(mediaRows)

    // 4. Broadcast real-time deletion event
    try {
      const channel = supabase.channel('inbox-broadcast')
      await channel.send({
        type: 'broadcast',
        event: 'customer-deleted',
        payload: { psid, platform },
      })
      void supabase.removeChannel(channel)
    } catch (bcError) {
      console.warn('[delete-conversation] broadcast warning:', bcError)
    }

    return NextResponse.json({ success: true, psid, platform, media })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
