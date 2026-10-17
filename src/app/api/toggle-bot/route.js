import { supabase } from '../../../../lib/supabase.js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { psid, botActive } = body ?? {}
  if (
    typeof psid !== 'string' ||
    !/^wa_\d{5,20}$/.test(psid) ||
    typeof botActive !== 'boolean'
  ) {
    return NextResponse.json({ success: false, error: 'Invalid request data' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('customers')
      .update({ bot_active: botActive })
      .eq('psid', psid)
      .eq('platform', 'whatsapp')
      .select('psid')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: 'Could not update bot status' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Could not update bot status' }, { status: 500 })
  }
}