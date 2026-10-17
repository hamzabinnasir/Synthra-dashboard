import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'
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

  const psid = body?.psid
  const isInstagram = typeof psid === 'string' && /^ig_\d+$/.test(psid)
  const isFacebook = typeof psid === 'string' && /^\d{5,20}$/.test(psid)
  if (!isFacebook && !isInstagram) {
    return NextResponse.json({ success: false, error: 'Invalid Facebook or Instagram conversation' }, { status: 400 })
  }
  const platform = isInstagram ? 'instagram' : 'facebook'

  const supabase = getFacebookSupabase()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Social inbox database is not configured' }, { status: 503 })
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('psid')
    .eq('psid', psid)
    .eq('platform', platform)
    .maybeSingle()

  if (customerError) {
    return NextResponse.json({ success: false, error: 'Could not load conversation' }, { status: 500 })
  }
  if (!customer) {
    return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
  }

  // Remember the Cloudinary files before the RPC deletes the message rows.
  const mediaRows = await fetchMediaRows(supabase, 'psid', [psid])

  const { data, error } = await supabase.rpc('clear_conversation_history', {
    p_psid: psid,
    p_actor_id: `${platform}-dashboard`,
  })
  if (error) {
    return NextResponse.json({ success: false, error: 'Could not clear chat history' }, { status: 500 })
  }

  const media = await destroyMediaAssets(mediaRows)

  return NextResponse.json({ success: true, ...data, media })
}
