import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'

export const dynamic = 'force-dynamic'

// POST /api/conversation/mark-read  { psid } -> resets that conversation's unread counter to 0.
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const psid = typeof body?.psid === 'string' ? body.psid.trim() : ''
  if (!/^(?:wa_|ig_)?\d{5,20}$/.test(psid)) {
    return NextResponse.json({ success: false, error: 'Invalid conversation ID' }, { status: 400 })
  }

  const db = psid.startsWith('wa_') ? supabase : (getFacebookSupabase() || supabase)

  // Only touch rows that actually have unread messages, so no needless realtime events fire.
  const { error } = await db
    .from('customers')
    .update({ unread_count: 0 })
    .eq('psid', psid)
    .gt('unread_count', 0)

  if (error) {
    // Migration 20261013_unread_counters.sql has not been run yet: not an app error.
    if (error.code === '42703' || error.code === 'PGRST204' || String(error.message || '').includes('unread_count')) {
      return NextResponse.json({ success: true, migration_needed: true })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
