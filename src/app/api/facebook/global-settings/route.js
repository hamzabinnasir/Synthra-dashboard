import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../../lib/facebook-dashboard.js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const allowedSettings = new Set([
  'comment_bot_active',
  'inbox_bot_active',
  'instagram_comment_bot_active',
  'instagram_inbox_bot_active',
  'whatsapp_inbox_bot_active',
])

// GET /api/facebook/global-settings -> { success, settings: { <flag>: boolean }, connected }
// Used by the mobile app to show which bots are paused globally.
export async function GET() {
  try {
    const { settings, connected } = await getGlobalBotSettings()
    return NextResponse.json({ success: true, settings, connected })
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load global bot settings' }, { status: 500 })
  }
}

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