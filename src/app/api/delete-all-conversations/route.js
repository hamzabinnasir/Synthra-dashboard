import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase.js'
import { destroyMediaAssets, fetchMediaRows } from '../../../../lib/cloudinary.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const platform = body?.platform?.trim() || ''

  if (!['whatsapp', 'facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ success: false, error: 'Valid platform is required (whatsapp, facebook, or instagram)' }, { status: 400 })
  }

  try {
    // 1. Fetch matching customer PSIDs for this platform
    let query = supabase.from('customers').select('psid')

    if (platform === 'whatsapp') {
      query = query.or('platform.eq.whatsapp,psid.ilike.wa_%')
    } else if (platform === 'instagram') {
      query = query.or('platform.eq.instagram,psid.ilike.ig_%')
    } else if (platform === 'facebook') {
      query = query.or('platform.eq.facebook,platform.is.null')
    }

    const { data: customerList, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    let psids = (customerList || []).map((c) => c.psid)
    if (platform === 'facebook') {
      psids = psids.filter((id) => !String(id).startsWith('wa_') && !String(id).startsWith('ig_'))
    }

    let media = { deleted: 0, failed: 0, skipped: 0 }

    if (psids.length > 0) {
      // 2. Remember the Cloudinary files before their message rows are deleted
      const mediaRows = await fetchMediaRows(supabase, 'psid', psids)

      // 3. Delete messages for these PSIDs (chunked so the request URL stays small)
      for (let i = 0; i < psids.length; i += 100) {
        const { error: msgErr } = await supabase
          .from('messages')
          .delete()
          .in('psid', psids.slice(i, i + 100))
        if (msgErr) {
          console.warn('[delete-all-conversations] messages delete warning:', msgErr.message)
        }
      }

      // 4. Delete the customers from customers table
      for (let i = 0; i < psids.length; i += 100) {
        const { error: custErr } = await supabase
          .from('customers')
          .delete()
          .in('psid', psids.slice(i, i + 100))
        if (custErr) {
          return NextResponse.json({ success: false, error: custErr.message }, { status: 500 })
        }
      }

      // 5. Database rows are gone: remove the media from Cloudinary
      media = await destroyMediaAssets(mediaRows)
    }

    // 6. Broadcast global delete event across all connected clients
    try {
      const channel = supabase.channel('inbox-broadcast')
      await channel.send({
        type: 'broadcast',
        event: 'all-conversations-deleted',
        payload: { platform },
      })
      void supabase.removeChannel(channel)
    } catch (bcError) {
      console.warn('[delete-all-conversations] broadcast warning:', bcError)
    }

    return NextResponse.json({ success: true, count: psids.length, platform, media })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
