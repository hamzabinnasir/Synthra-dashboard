import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { NextResponse } from 'next/server'

const allowedSettings = new Set([
  'comment_bot_active',
  'inbox_bot_active',
  'instagram_comment_bot_active',
  'instagram_inbox_bot_active',
  'whatsapp_inbox_bot_active',
])

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { setting, active } = body ?? {}
  if (!allowedSettings.has(setting) || typeof active !== 'boolean') {
    return NextResponse.json({ success: false, error: 'Invalid setting or state' }, { status: 400 })
  }

  const supabase = getFacebookSupabase()
  if (!supabase) return NextResponse.json({ success: false, error: 'Facebook Supabase is not configured' }, { status: 503 })

  const { error } = await supabase
    .from('bot_settings')
    .upsert({ id: 1, [setting]: active, updated_at: new Date().toISOString() }, { onConflict: 'id' })

  if (error) return NextResponse.json({ success: false, error: 'Could not save global bot state' }, { status: 500 })

  await supabase.from('activity_logs').insert({ event: 'state_change', detail: { [setting]: active } })
  return NextResponse.json({ success: true })
}