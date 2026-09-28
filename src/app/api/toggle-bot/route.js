import { supabase } from '../../../../lib/supabase.js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { conversationId, botActive } = body ?? {}
  if (
    (typeof conversationId !== 'string' && typeof conversationId !== 'number') ||
    String(conversationId).trim() === '' ||
    typeof botActive !== 'boolean'
  ) {
    return NextResponse.json({ success: false, error: 'Invalid request data' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .update({ bot_active: botActive })
      .eq('id', conversationId)
      .select('id')
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