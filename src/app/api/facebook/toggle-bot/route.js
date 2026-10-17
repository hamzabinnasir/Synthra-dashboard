import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { target, id, botActive } = body ?? {}
  if (target !== 'customer' || typeof id !== 'string' || !id.trim() || typeof botActive !== 'boolean') {
    return NextResponse.json({ success: false, error: 'Invalid conversation or state' }, { status: 400 })
  }

  const supabase = getFacebookSupabase()
  if (!supabase) return NextResponse.json({ success: false, error: 'Facebook Supabase is not configured' }, { status: 503 })

  const { data, error } = await supabase
    .from('customers')
    .update({ bot_active: botActive })
    .eq('psid', id)
    .select('psid')
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, error: 'Could not save conversation bot state' }, { status: 500 })
  if (!data) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}